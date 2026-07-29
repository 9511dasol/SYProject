/** 백엔드 ai_tool_usage_logs.tool 과 짝이 맞아야 한다 (app/services/ai_usage.py) */
export type AIToolKey =
  | 'image_filter'
  | 'image_resize'
  | 'heading_suggest'
  | 'marketing_comment'
  | 'report_mail';

export interface AIToolUsageLogItem {
  id: number;
  user_id: number;
  user_email: string;
  tool: AIToolKey;
  image_filename: string;
  prompt: string;
  prompt_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
}

export interface AIToolUsageLogListResponse {
  items: AIToolUsageLogItem[];
  total: number;
}

export interface AIUsageSummary {
  month: string;
  total_tokens: number;
  by_tool: Partial<Record<AIToolKey, number>>;
  monthly_token_budget: number;
}
