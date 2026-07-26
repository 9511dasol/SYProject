export type AIToolKey = 'image_filter' | 'image_resize' | 'heading_suggest';

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
