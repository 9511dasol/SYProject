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

/**
 * 파일을 저장한다 — 브라우저 기본 다운로드 하나만 쓴다.
 *
 * 예전에는 File System Access API(showSaveFilePicker)로 위치를 고르게 하고,
 * 실패하면 기본 다운로드로 폴백했다. 그런데 저장 경로가 둘이면 각자 위치를 물어서
 * "저장 위치를 두 번 묻는" 상황을 피할 수 없었다:
 *   showSaveFilePicker 로 한 번 → createWritable 거부 → 폴백 다운로드에서 또 한 번.
 * (브라우저가 그 출처에 '파일 편집'을 막아두면 createWritable이 거부되는데,
 *  이건 미리 알 수 없어서 시도해봐야만 드러난다.)
 *
 * 경로를 하나로 줄이면 어떤 환경에서도 대화상자는 정확히 한 번만 뜬다.
 * 위치 선택은 브라우저의 "다운로드 전에 각 파일의 저장 위치 확인" 설정이 대신한다.
 */
export function saveFile(blob: Blob, filename: string): void {
  downloadBlob(blob, filename);
}
