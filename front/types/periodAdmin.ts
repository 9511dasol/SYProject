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
  /** 이 기간에 직접 저장된 매체별 예산이 있는지 (없으면 이전 기간 값을 이어받는다) */
  has_budget: boolean;
}

export interface PeriodOverviewResponse {
  items: PeriodOverviewItem[];
  total_rows: number;
}

export interface MediaBudgetsResponse {
  year: number;
  month: number;
  /** { "네이버SA": 19000000, ... } — 설정되지 않은 매체는 키가 없다 */
  budgets: Record<string, number>;
  /** 값을 실제로 가져온 기간 "YYYY-MM". 요청한 기간에 저장된 값이면 그 기간과 같다 */
  inherited_from: string | null;
  /** 엑셀 템플릿에 자리가 있는 매체 목록 (입력 폼의 행 순서) */
  media: string[];
}

export interface PeriodDeleteResponse {
  year: number;
  month: number;
  deleted_rows: number;
  deleted_meta: boolean;
  deleted_excel: boolean;
  message: string;
}
