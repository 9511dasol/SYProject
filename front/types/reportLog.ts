export type ReportLogStatus = 'sent' | 'error';

export interface ReportLogItem {
  id: number;
  curr_year: number;
  curr_month: number;
  prev_year: number;
  prev_month: number;
  /** 쉼표로 이어붙인 수신자 목록 */
  recipients: string;
  subject: string;
  status: ReportLogStatus;
  error_msg: string | null;
  created_at: string;
}

export interface ReportLogListResponse {
  items: ReportLogItem[];
  total: number;
  /** 상태별 전체 건수 — 필터와 무관한 요약값 */
  counts: Partial<Record<ReportLogStatus, number>>;
}

export interface ReportResendResponse {
  status: 'sent';
  recipients: string[];
  log: ReportLogItem;
}
