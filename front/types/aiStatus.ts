/** GET /api/admin/ai-status 항목 — 실제 API 키 값은 포함하지 않음 */
export interface AIProviderStatus {
  key: string;
  label: string;
  model: string;
  api_key_configured: boolean;
  is_active: boolean;
}

/** GET /api/admin/ai-status 응답 */
export interface AIStatus {
  active_provider: string;
  providers: AIProviderStatus[];
}
