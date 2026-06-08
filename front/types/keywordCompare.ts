export type RowStatus = 'new' | 'gone' | 'up' | 'down' | 'same';

export interface CompareRow {
  campaign_type: string;
  device: string;
  keyword: string;
  conv_type: string;
  curr_conv: number;
  curr_amount: number;
  prev_conv: number;
  prev_amount: number;
  diff_conv: number;
  diff_amount: number;
  status: RowStatus;
}

export interface SheetSummary {
  total_curr_conv: number;
  total_curr_amount: number;
  total_prev_conv: number;
  total_prev_amount: number;
  diff_conv: number;
  diff_amount: number;
  count_up: number;
  count_down: number;
  count_new: number;
  count_gone: number;
  count_same: number;
}

export interface CompareSheet {
  name: string;
  period: string;
  rows: CompareRow[];
  summary: SheetSummary;
  campaign_types: string[];
  devices: string[];
  conv_types: string[];
}

export interface CompareResult {
  sheets: CompareSheet[];
}
