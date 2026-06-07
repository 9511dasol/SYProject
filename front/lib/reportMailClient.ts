import axios, { isAxiosError } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
});

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    return err.response?.data?.detail ?? fallback;
  }
  return fallback;
}

export interface SendReportPayload {
  curr_year: number;
  curr_month: number;
  prev_year: number;
  prev_month: number;
  recipients: string[];
  subject?: string;
}

export interface SendReportResponse {
  status: string;
  message: string;
}

export interface ReportLog {
  id: number;
  curr_year: number;
  curr_month: number;
  prev_year: number;
  prev_month: number;
  recipients: string;
  subject: string;
  status: 'sent' | 'error';
  error_msg: string | null;
  created_at: string;
}

export async function sendReportMail(payload: SendReportPayload): Promise<SendReportResponse> {
  try {
    const { data } = await api.post<SendReportResponse>('/api/report-mail/send', payload);
    return data;
  } catch (err) {
    throw new Error(extractError(err, '리포트 발송 실패'));
  }
}

export async function getReportLogs(limit = 50): Promise<ReportLog[]> {
  try {
    const { data } = await api.get<ReportLog[]>('/api/report-mail/logs', {
      params: { limit },
    });
    return data;
  } catch (err) {
    throw new Error(extractError(err, '발송 이력 조회 실패'));
  }
}
