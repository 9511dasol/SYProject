import { isAxiosError } from 'axios';
import { browserApi as api } from '@/lib/api/browserApi';

// BFF Route Handler(/api/report-mail/*)를 거쳐 FastAPI로 전달된다.
// 예전에는 브라우저가 FastAPI를 직접 호출했는데, 그러면 Authorization 헤더를 실을
// 수단이 없어 백엔드 쪽 엔드포인트를 인증 없이 열어둬야만 동작했다.
// 같은 오리진으로 바꾸면 Route Handler가 세션으로 인증을 대신 처리한다.

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
