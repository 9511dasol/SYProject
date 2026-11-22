import type { ExcelReport } from '@/types/marketing';
import type { ImportedReport } from '@/components/marketing/ReportDashboard';

const DB_NAME = 'marketing_reports';
const DB_VERSION = 1;
const STORE_NAME = 'imported_reports';
const TAB_KEY = 'marketing_active_tab';

interface StoredReport {
  id: string;
  label: string;
  /** 예전 버전에서 저장된 항목에는 없다 — 복원 시 data.period로 폴백한다 */
  period?: string;
  fileName: string;
  fileType: string;
  /**
   * 원본 파일의 최종 수정 시각. 화면이 코멘트 옆에 "파일 기준 …"으로 쓴다.
   * 이걸 담지 않으면 복원할 때 새로 만든 File 이 '지금'을 수정 시각으로 갖게 되어,
   * 새로고침만 했을 뿐인데 코멘트가 방금 갱신된 것처럼 보인다.
   * 예전 버전에서 저장된 항목에는 없다 — 복원 시 createdAt 으로 폴백한다.
   */
  fileLastModified?: number;
  data: ExcelReport;
  fileBuffer: ArrayBuffer;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 보관할 최대 리포트 수 — 넘으면 오래된 것부터 지운다. */
const MAX_STORED_REPORTS = 10;

/** 저장 용량이 꽉 찼을 때 던지는 오류 — 화면이 안내 문구를 고를 수 있게 구분한다. */
export class ReportStorageFullError extends Error {
  constructor() {
    super('브라우저 저장 공간이 가득 찼습니다. 불러온 리포트를 일부 삭제한 뒤 다시 시도해 주세요.');
    this.name = 'ReportStorageFullError';
  }
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

/** 보관 개수를 넘는 오래된 항목을 지운다. */
async function pruneOldest(db: IDBDatabase, keepId: string): Promise<void> {
  const readTx = db.transaction(STORE_NAME, 'readonly');
  const all = await idbRequest<StoredReport[]>(readTx.objectStore(STORE_NAME).getAll());

  const stale = all
    .filter((s) => s.id !== keepId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, all.length - MAX_STORED_REPORTS));
  if (stale.length === 0) return;

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  stale.forEach((s) => store.delete(s.id));
  await idbTx(tx);
}

/**
 * 불러온 리포트를 브라우저에 보관한다 (새로고침 후 복원용).
 *
 * 예전에는 저장 실패를 아무도 잡지 않아, 용량이 꽉 차면 조용히 실패하고 다음 방문에
 * 리포트가 사라져 있었다. 또 지우는 사람이 없어 보관본이 무한정 쌓였다.
 */
export async function persistReport(report: ImportedReport): Promise<void> {
  const db = await openDb();
  const fileBuffer = await report.file.arrayBuffer();
  const stored: StoredReport = {
    id: report.id,
    label: report.label,
    period: report.period ?? report.data.period,
    fileName: report.file.name,
    fileType: report.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileLastModified: report.file.lastModified,
    data: report.data,
    fileBuffer,
    createdAt: Date.now(),
  };

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(stored);
    await idbTx(tx);
  } catch (err) {
    if (!isQuotaError(err)) throw err;

    // 오래된 보관본을 비우고 한 번만 다시 시도한다
    await pruneOldest(db, stored.id);
    try {
      const retryTx = db.transaction(STORE_NAME, 'readwrite');
      retryTx.objectStore(STORE_NAME).put(stored);
      await idbTx(retryTx);
      return;
    } catch (retryErr) {
      if (isQuotaError(retryErr)) throw new ReportStorageFullError();
      throw retryErr;
    }
  }

  await pruneOldest(db, stored.id);
}

export async function loadPersistedReports(): Promise<ImportedReport[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const stored = await idbRequest<StoredReport[]>(tx.objectStore(STORE_NAME).getAll());
  return stored
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => ({
      id: s.id,
      label: s.label,
      period: s.period ?? s.data.period,
      data: s.data,
      file: new File([s.fileBuffer], s.fileName, {
        type: s.fileType,
        // 폴백이 createdAt 인 이유 — 불러온 시각이 '지금'보다는 원본에 가깝다
        lastModified: s.fileLastModified ?? s.createdAt,
      }),
    }));
}

export async function deletePersistedReport(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await idbTx(tx);
}

export function saveActiveTab(tab: string): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // localStorage 접근 불가 환경 무시
  }
}

export function loadActiveTab(): string {
  try {
    return localStorage.getItem(TAB_KEY) ?? 'db';
  } catch {
    return 'db';
  }
}
