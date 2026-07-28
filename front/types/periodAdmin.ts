export interface PeriodOverviewItem {
  year: number;
  month: number;
  row_count: number;
  /** "YYYY-MM-DD" — 데이터가 없으면 null */
  first_date: string | null;
  last_date: string | null;
  has_comment: boolean;
  comment_updated_at: string | null;
  has_excel: boolean;
}

export interface PeriodOverviewResponse {
  items: PeriodOverviewItem[];
  total_rows: number;
}

export interface PeriodDeleteResponse {
  year: number;
  month: number;
  deleted_rows: number;
  deleted_meta: boolean;
  deleted_excel: boolean;
  message: string;
}
