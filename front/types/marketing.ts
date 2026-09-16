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

/** /load-excel 응답 — 한 파일에 5월·6월처럼 여러 달이 있으면 달마다 리포트가 하나씩 온다 */
export interface ExcelReportBundle {
  periods: string[];
  reports: ExcelReport[];
}

/**
 * /excel-periods 응답의 한 줄 — 기간 선택 화면이 쓰는 값만 담긴 가벼운 요약.
 * 전체 리포트(ExcelReport)를 받으면 매체 시트까지 파싱하느라 큰 파일에서 수 분이 걸린다.
 */
export interface ExcelPeriodSummary {
  period: string;
  /** 실적이 들어 있는 일수 — 목록의 "N일" 배지 */
  days: number;
  comment: string;
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
  comment_updated_at?: string | null;
  diff?: Record<string, RowDiff>;  // {campaign_type: {added, updated}}
  undo_id?: string;
}

export interface RowFormData {
  report_date: string;         // "YYYY-MM-DD"
  campaign_type: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;         // DB: conversions (= total_conv in frontend)
  conversion_revenue: number;  // DB: conversion_revenue (= revenue in frontend)
  signup: number;
  purchase: number;
  apply: number;
}
