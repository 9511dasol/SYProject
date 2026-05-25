import type { ExcelReport } from '@/types/marketing';
import type { ImportedReport } from '@/app/HomeClient';

const DB_NAME = 'marketing_reports';
const DB_VERSION = 1;
const STORE_NAME = 'imported_reports';
const TAB_KEY = 'marketing_active_tab';

interface StoredReport {
  id: string;
  label: string;
  fileName: string;
  fileType: string;
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

export async function persistReport(report: ImportedReport): Promise<void> {
  const db = await openDb();
  const fileBuffer = await report.file.arrayBuffer();
  const stored: StoredReport = {
    id: report.id,
    label: report.label,
    fileName: report.file.name,
    fileType: report.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    data: report.data,
    fileBuffer,
    createdAt: Date.now(),
  };
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(stored);
  await idbTx(tx);
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
      data: s.data,
      file: new File([s.fileBuffer], s.fileName, { type: s.fileType }),
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
