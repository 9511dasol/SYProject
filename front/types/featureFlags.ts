/** 백엔드 system_settings 테이블에 등록된 기능 플래그 키. */
export type FeatureFlagKey =
  | 'is_dashboard_enabled'
  | 'is_report_email_enabled'
  | 'is_keyword_compare_enabled'
  | 'is_image_filter_enabled'
  | 'is_image_resize_enabled'
  | 'is_heading_suggest_enabled';

/** GET /api/settings/flags 응답 — key → on/off */
export type FeatureFlags = Record<string, boolean>;

/** GET/PATCH /api/admin/settings 항목 */
export interface FeatureFlagItem {
  key: string;
  value: boolean;
  description: string;
}
