export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Excel 불러오기
export interface BudgetRow {
  category: string;
  budget: number;
  spent: number;
  burn_rate: number;
  impressions: number;
  clicks: number;
  cost_vat: number;
  total_conv: number;
  conv_rate: number;
  conv_cost: number;
}

export interface DailyTotalRow {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  total_conv: number;
  conv_rate: number;
  conv_cost: number;
}

export interface MediaSheetData {
  headers: string[];
  total: (string | number | null)[];
  daily: (string | number | null)[][];
}

export interface SaTotalRow {
  label: string;
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost_vat: number;
  cost_markup: number;
  total_conv: number;
  conv_rate: number;
  conv_cost: number;
  total_conv_ex: number;
  conv_rate_ex: number;
  conv_cost_ex: number;
  signup: number;
  signup_rate: number;
  purchase: number;
  purchase_rate: number;
  revenue: number;
  roas: number;
  revenue_per_purchase: number;
}

export interface SaTotal {
  headers: string[];
  rows: SaTotalRow[];
}

export interface ExcelReport {
  period: string;
  period_info: { remaining_days: number; elapsed_days: number; total_days: number };
  sa_total: SaTotal;
  budget_table: BudgetRow[];
  comment: string;
  daily_total: DailyTotalRow[];
  media: Record<string, MediaSheetData>;
}

export interface MediaDailyRow {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
  total_conv: number;
  conv_rate: number;
  conv_cost: number;
  signup: number;
  purchase: number;
  revenue: number;
  apply: number;
  roas: number;
}

export interface MediaSummary {
  label: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
  total_conv: number;
  signup: number;
  purchase: number;
  revenue: number;
  apply: number;
  roas: number;
}

export interface RowDiff {
  added: string[];    // "YYYY-MM-DD"
  updated: string[];
}

export interface ReportData {
  period: string;
  total: MediaSummary;
  by_media: MediaSummary[];
  daily: Record<string, MediaDailyRow[]>;
  comment?: string;
  diff?: Record<string, RowDiff>;  // {campaign_type: {added, updated}}
  undo_id?: string;
}

export interface UploadTaskResponse {
  task_id: string;
  status: TaskStatus;
  message: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: TaskStatus;
  processed_rows?: number;
  ai_comment?: string;
  error?: string;
}


export interface AnalysisResult {
  processedRows: number;
  aiComment: string;
}
