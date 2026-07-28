import { isAxiosError } from 'axios';
import { browserApi as api } from '@/lib/api/browserApi';
import type {
  ExcelReport,
  ExcelReportBundle,
  ReportData,
  RowFormData,
  TaskStatusResponse,
  UploadTaskResponse,
} from '@/types/marketing';

// BFF Route Handler(/api/marketing/*)를 거쳐 FastAPI로 전달된다.
// 같은 오리진이라 baseURL이 필요 없고, 인증은 Route Handler가 세션으로 처리한다.

function toFormData(files: File[]): FormData {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  return formData;
}

/**
 * 저장 엔드포인트용 쿼리스트링.
 * 기간은 `period=26년 5월&period=26년 6월` 처럼 같은 키를 반복해야 FastAPI가 list로 받는다
 * (axios 기본 직렬화는 `period[]=` 로 나가서 서버가 못 읽는다).
 */
function saveQuery(replace: boolean, periods?: string[]): string {
  const qs = new URLSearchParams({ replace: String(replace) });
  periods?.forEach((p) => qs.append('period', p));
  return qs.toString();
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    return err.response?.data?.detail ?? fallback;
  }
  return fallback;
}

export async function uploadMarketingFiles(files: File[]): Promise<UploadTaskResponse> {
  try {
    const { data } = await api.post<UploadTaskResponse>(
      '/api/marketing/upload',
      toFormData(files)
    );
    return data;
  } catch (err) {
    throw new Error(extractError(err, `업로드 실패: ${(err as Error).message}`));
  }
}

export async function pollTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  try {
    const { data } = await api.get<TaskStatusResponse>(`/api/marketing/status/${taskId}`);
    return data;
  } catch (err) {
    throw new Error(extractError(err, `상태 조회 실패: ${(err as Error).message}`));
  }
}

export async function exportToExcel(files: File[]): Promise<Blob> {
  try {
    const response = await api.post('/api/marketing/export', toFormData(files), {
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (err) {
    throw new Error(extractError(err, `엑셀 생성 실패: ${(err as Error).message}`));
  }
}

export async function previewReport(files: File[]): Promise<ReportData> {
  try {
    const { data } = await api.post<ReportData>('/api/marketing/preview', toFormData(files));
    return data;
  } catch (err) {
    throw new Error(extractError(err, `리포트 생성 실패: ${(err as Error).message}`));
  }
}

/**
 * 엑셀 파일 안의 모든 기간(달)을 각각 리포트로 받아온다.
 *
 * 예전 백엔드는 리포트 객체 하나를 그대로 돌려줬다. 배포가 프론트 먼저 나가는 순간
 * data.reports가 undefined가 되어 화면이 깨지므로, 두 응답 형태를 모두 받아 준다.
 */
export async function loadExcelReports(file: File): Promise<ExcelReport[]> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<ExcelReportBundle | ExcelReport>(
      '/api/marketing/load-excel',
      formData,
    );
    if (data && Array.isArray((data as ExcelReportBundle).reports)) {
      return (data as ExcelReportBundle).reports;
    }
    return (data as ExcelReport)?.period ? [data as ExcelReport] : [];
  } catch (err) {
    throw new Error(extractError(err, `Excel 불러오기 실패: ${(err as Error).message}`));
  }
}

/** periods 를 주면 고른 달만, 없으면 파일 안의 모든 달을 저장한다. */
export async function saveExcelData(
  file: File,
  replace = false,
  periods?: string[],
): Promise<{ saved_rows: number; deleted_rows: number; periods: string[]; message: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(
      `/api/marketing/save-excel-data?${saveQuery(replace, periods)}`,
      formData,
    );
    return data;
  } catch (err) {
    throw new Error(extractError(err, `DB 저장 실패: ${(err as Error).message}`));
  }
}

export async function getPeriods(): Promise<{ year: number; month: number }[]> {
  try {
    const { data } = await api.get('/api/marketing/periods');
    return data;
  } catch (err) {
    throw new Error(extractError(err, `기간 조회 실패: ${(err as Error).message}`));
  }
}

export async function exportDbToExcel(year: number, month: number): Promise<Blob> {
  try {
    const response = await api.get('/api/marketing/export-db', {
      params: { year, month },
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (err) {
    throw new Error(extractError(err, `Excel 다운로드 실패: ${(err as Error).message}`));
  }
}

export async function getSummary(year: number, month: number): Promise<ReportData> {
  try {
    const { data } = await api.get<ReportData>('/api/marketing/summary', { params: { year, month } });
    return data;
  } catch (err) {
    throw new Error(extractError(err, `요약 조회 실패: ${(err as Error).message}`));
  }
}

/** 직전월 대비 누적 DB 데이터를 기반으로 AI 코멘트를 새로 생성하고 저장 */
export async function updateComment(
  year: number,
  month: number,
): Promise<{ comment: string; comment_updated_at: string | null }> {
  try {
    const { data } = await api.post('/api/marketing/comment', null, { params: { year, month } });
    return data as { comment: string; comment_updated_at: string | null };
  } catch (err) {
    throw new Error(extractError(err, `코멘트 생성 실패: ${(err as Error).message}`));
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 백그라운드 DB→Excel 변환 태스크 시작.
 * deliverBy="email"이면 완료 시 브라우저 다운로드 대신 로그인한 사용자 이메일로
 * 다운로드 링크를 보낸다 — 파일이 커서(운영 환경 Vercel BFF 응답 크기 제한) 직접
 * 다운로드가 실패하는 경우를 위한 대안 경로.
 */
export interface DbExportTask {
  task_id: string;
  filename: string;
  deliver_by: 'download' | 'email';
  recipients: string[];
}

/** recipients 를 주면 그 주소들로, 생략하면 로그인한 계정으로 보낸다. */
export async function startDbExportTask(
  year: number,
  month: number,
  deliverBy: 'download' | 'email' = 'download',
  recipients?: string[],
): Promise<DbExportTask> {
  try {
    // 받는 사람은 같은 키를 반복해야 FastAPI가 list로 받는다 (axios 기본 직렬화는 recipient[]=)
    const qs = new URLSearchParams({
      year: String(year),
      month: String(month),
      deliver_by: deliverBy,
    });
    recipients?.forEach((r) => qs.append('recipient', r));
    const { data } = await api.post(`/api/marketing/export-db-task?${qs.toString()}`);
    return data as DbExportTask;
  } catch (err) {
    throw new Error(extractError(err, 'Excel 변환 시작 실패'));
  }
}

export interface DbExportStatus {
  status: string;
  progress: number;
  message?: string;
  error?: string;
  delivered_by?: 'download' | 'email';
  recipients?: string[];
}

/** export 태스크 진행률 조회 */
export async function getDbExportStatus(taskId: string): Promise<DbExportStatus> {
  try {
    const { data } = await api.get(`/api/marketing/export-db-task/${taskId}`);
    return data as DbExportStatus;
  } catch (err) {
    throw new Error(extractError(err, '진행률 조회 실패'));
  }
}

/** 진행 중인 export 태스크 취소 */
export async function cancelDbExportTask(taskId: string): Promise<void> {
  try {
    await api.delete(`/api/marketing/export-db-task/${taskId}`);
  } catch {
    // 이미 완료됐거나 없는 태스크면 무시
  }
}

/** 완료된 export 파일 받기 */
export async function getDbExportResult(taskId: string): Promise<Blob> {
  try {
    const response = await api.get(`/api/marketing/export-db-result/${taskId}`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (err) {
    throw new Error(extractError(err, '파일 다운로드 실패'));
  }
}

/** periods 를 주면 고른 달만, 없으면 파일 안의 모든 달을 저장한다. */
export async function startSaveExcelTask(
  file: File,
  replace = false,
  periods?: string[],
): Promise<{ task_id: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(
      `/api/marketing/save-excel-task?${saveQuery(replace, periods)}`,
      formData,
    );
    return data as { task_id: string };
  } catch (err) {
    throw new Error(extractError(err, 'DB 저장 시작 실패'));
  }
}

export async function getSaveExcelTaskStatus(taskId: string): Promise<{
  status: string;
  progress?: number;
  saved_rows?: number;
  deleted_rows?: number;
  undo_id?: string;
  message?: string;
  error?: string;
}> {
  try {
    const { data } = await api.get(`/api/marketing/save-excel-task/${taskId}`);
    return data;
  } catch (err) {
    throw new Error(extractError(err, '저장 상태 조회 실패'));
  }
}

export async function upsertMarketingRow(
  body: RowFormData,
): Promise<{ saved: number; message: string }> {
  try {
    const { data } = await api.post('/api/marketing/rows', body);
    return data as { saved: number; message: string };
  } catch (err) {
    throw new Error(extractError(err, '행 저장 실패'));
  }
}

export async function deleteMarketingRow(
  reportDate: string,
  campaignType: string,
): Promise<{ deleted: number; message: string }> {
  try {
    const { data } = await api.delete('/api/marketing/rows', {
      params: { report_date: reportDate, campaign_type: campaignType },
    });
    return data as { deleted: number; message: string };
  } catch (err) {
    throw new Error(extractError(err, '행 삭제 실패'));
  }
}

export async function undoUpload(undoId: string): Promise<{ message: string }> {
  try {
    const { data } = await api.post(`/api/marketing/undo/${undoId}`);
    return data as { message: string };
  } catch (err) {
    throw new Error(extractError(err, '되돌리기 실패'));
  }
}

/** saveFileWithPicker 결과 — 호출부가 안내 문구를 다르게 낼 수 있도록 구분한다. */
export type SaveResult =
  | 'saved'       // 사용자가 고른 위치에 저장 완료
  | 'cancelled'   // 사용자가 저장 대화상자를 닫음 (blob은 그대로라 다시 시도 가능)
  | 'downloaded'; // picker를 못 써서 브라우저 기본 다운로드로 처리

type SaveFilePicker = (opts: unknown) => Promise<FileSystemFileHandle>;

// 이 출처에서 저장 위치 지정이 실제로 막혀 있는지 기억한다.
//
// 브라우저가 '파일 편집'을 차단한 출처에서는 대화상자는 뜨지만 createWritable이 거부된다.
// 그때 기본 다운로드로 폴백하는데, 브라우저의 "저장 위치 확인" 설정이 켜져 있으면
// 거기서 대화상자가 한 번 더 뜬다 — 사용자에겐 위치를 두 번 묻는 것으로 보인다.
// 한 번 막힌 걸 확인했으면 이후에는 대화상자를 건너뛰고 바로 기본 다운로드로 간다.
// (localStorage는 출처별로 분리되므로 배포 도메인은 영향받지 않는다)
const _FSA_BLOCKED_KEY = 'save:file-system-access-blocked';

function isSaveLocationBlocked(): boolean {
  try {
    return localStorage.getItem(_FSA_BLOCKED_KEY) === '1';
  } catch {
    return false; // 스토리지를 못 쓰면 매번 시도한다 — 기능이 막히는 것보다 낫다
  }
}

function markSaveLocationBlocked(): void {
  try {
    localStorage.setItem(_FSA_BLOCKED_KEY, '1');
  } catch {
    /* 스토리지를 못 써도 저장 자체는 폴백으로 진행된다 */
  }
}

function getSavePicker(): SaveFilePicker | null {
  if (typeof window === 'undefined') return null;
  if (isSaveLocationBlocked()) return null;
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof picker === 'function' ? picker : null;
}

/** 이 브라우저가 '다른 이름으로 저장' 대화상자를 지원하는지 (Chrome/Edge 계열만 지원) */
export function canPickSaveLocation(): boolean {
  return getSavePicker() !== null;
}

/**
 * File System Access API로 저장 위치를 고르게 한다. 지원하지 않으면 기본 다운로드로 폴백.
 *
 * 반드시 클릭 핸들러 안에서 직접 호출해야 한다 — showSaveFilePicker는 사용자 제스처를
 * 요구해서, 폴링 완료 콜백이나 setTimeout 안에서 부르면 SecurityError로 튕기고
 * 조용히 기본 다운로드로 넘어간다.
 */
export async function saveFileWithPicker(blob: Blob, defaultName: string): Promise<SaveResult> {
  const picker = getSavePicker();
  let handle: FileSystemFileHandle | null = null;

  if (picker) {
    // 대화상자를 여는 단계와 실제로 쓰는 단계를 분리한다.
    // 한 try로 묶으면 사용자가 위치를 고른 뒤 쓰기가 실패했을 때도 폴백이 돌아
    // 다운로드 폴더에 파일이 한 번 더 저장된다 — 저장이 두 번 일어나는 것처럼 보인다.
    try {
      // call(window, …) — 함수를 떼어내 부르면 일부 브라우저가 잘못된 this로 거부한다
      handle = await picker.call(window, {
        suggestedName: defaultName,
        types: [
          {
            description: 'Excel 파일',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'; // 사용자가 취소
      // SecurityError(제스처 없음)·NotAllowedError 등 — 대화상자 자체를 못 썼으니 폴백
    }
  }

  if (handle) {
    let writable: FileSystemWritableFileStream;
    try {
      writable = await handle.createWritable();
    } catch (e) {
      // 여기서 실패하면 아직 아무것도 쓰이지 않았다 — 폴백해도 파일이 두 벌이 되지 않는다.
      // 브라우저가 이 출처에 '파일 편집'을 막아둔 경우 여기서 NotAllowedError가 난다
      // (사이트별로 기억되므로 배포 도메인은 되는데 localhost만 막히는 일이 생긴다).
      // 기록해 두고 다음부터는 대화상자를 건너뛴다 — 안 그러면 매번 위치를 두 번 묻는다.
      markSaveLocationBlocked();
      console.warn(
        '[save] 이 사이트는 저장 위치 지정이 막혀 있어 기본 다운로드로 전환합니다. '
        + "주소창 왼쪽 아이콘 → '파일 편집'을 허용으로 바꾸면 위치 지정을 쓸 수 있습니다.",
        e,
      );
      downloadBlob(blob, defaultName);
      return 'downloaded';
    }

    // 스트림을 연 뒤의 실패는 파일이 일부 쓰였을 수 있다 — 폴백하면 두 벌이 되므로
    // 예외를 그대로 올려 호출부가 오류를 보여주고 다시 시도하게 한다.
    await writable.write(blob);
    await writable.close();
    return 'saved';
  }

  downloadBlob(blob, defaultName);
  return 'downloaded';
}
