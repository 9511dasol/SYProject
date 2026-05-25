import axios, { isAxiosError } from 'axios';
import type { ExcelReport, ReportData, TaskStatusResponse, UploadTaskResponse } from '@/types/marketing';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
});

function toFormData(files: File[]): FormData {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  return formData;
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

export async function loadExcelReport(file: File): Promise<ExcelReport> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<ExcelReport>('/api/marketing/load-excel', formData);
    return data;
  } catch (err) {
    throw new Error(extractError(err, `Excel 불러오기 실패: ${(err as Error).message}`));
  }
}

export async function saveExcelData(
  file: File,
  replace = false,
): Promise<{ saved_rows: number; deleted_rows: number; message: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(
      `/api/marketing/save-excel-data?replace=${replace}`,
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

/** 백그라운드 DB→Excel 변환 태스크 시작 */
export async function startDbExportTask(
  year: number,
  month: number,
): Promise<{ task_id: string; filename: string }> {
  try {
    const { data } = await api.post('/api/marketing/export-db-task', null, {
      params: { year, month },
    });
    return data as { task_id: string; filename: string };
  } catch (err) {
    throw new Error(extractError(err, 'Excel 변환 시작 실패'));
  }
}

/** export 태스크 진행률 조회 */
export async function getDbExportStatus(
  taskId: string,
): Promise<{ status: string; progress: number; error?: string }> {
  try {
    const { data } = await api.get(`/api/marketing/export-db-task/${taskId}`);
    return data as { status: string; progress: number; error?: string };
  } catch (err) {
    throw new Error(extractError(err, '진행률 조회 실패'));
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

export async function startSaveExcelTask(
  file: File,
  replace = false,
): Promise<{ task_id: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(`/api/marketing/save-excel-task?replace=${replace}`, formData);
    return data as { task_id: string };
  } catch (err) {
    throw new Error(extractError(err, 'DB 저장 시작 실패'));
  }
}

export async function getSaveExcelTaskStatus(taskId: string): Promise<{
  status: string;
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

export async function undoUpload(undoId: string): Promise<{ message: string }> {
  try {
    const { data } = await api.post(`/api/marketing/undo/${undoId}`);
    return data as { message: string };
  } catch (err) {
    throw new Error(extractError(err, '되돌리기 실패'));
  }
}

/**
 * 브라우저 File System Access API로 저장 위치 선택.
 * 지원 안 되면 자동으로 downloadBlob 폴백.
 */
export async function saveFileWithPicker(blob: Blob, defaultName: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (
        window as Window & { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }
      ).showSaveFilePicker({
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
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // 사용자가 취소
      // 지원 오류 등은 폴백으로
    }
  }
  downloadBlob(blob, defaultName);
}
