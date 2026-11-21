/** 키워드 순위 모니터링 — 백엔드 rank_monitor_schema.py 와 손으로 맞춘 타입. */

export type WatchDevice = 'all' | 'pc' | 'mobile';
export type WatchStatus = 'active' | 'paused';

/** GET /api/rank-monitor/watches 의 latest · history 항목 */
export interface RankSnapshot {
  stat_date: string; // "YYYY-MM-DD"
  /** null = 해당 날짜 노출 없음 (0위가 아니다) */
  avg_rank: number | null;
  impressions: number;
  clicks: number;
  source: string;
  collected_at: string | null;
}

export interface RankWatch {
  id: number;
  keyword: string;
  device: WatchDevice;
  target_rank: number;
  tolerance: number;
  breaches_required: number;
  cooldown_hours: number;
  alert_on_no_impression: boolean;
  color_tag: string | null;
  status: WatchStatus;
  breach_streak: number;
  /** 연속 이탈이 기준 횟수에 도달 — 목록의 '하락' 뱃지가 이 값 하나를 본다 */
  is_breached: boolean;
  /** 하락을 이미 알린 상태 — 목표 복귀 시 '회복' 알림이 한 번 나간다 */
  alerted: boolean;
  last_alerted_at: string | null;
  last_checked_at: string | null;
  latest: RankSnapshot | null;
}

export interface RankWatchListResponse {
  items: RankWatch[];
  total: number;
}

export interface WatchCreateItem {
  keyword: string;
  device: WatchDevice;
  target_rank: number;
  tolerance: number;
  breaches_required: number;
  /** 같은 하락을 다시 알리기까지의 최소 간격 */
  cooldown_hours: number;
  alert_on_no_impression: boolean;
  color_tag: string | null;
}

/** 적재·평가 직후의 알림 결과 */
export interface AlertSummary {
  drops: number;
  recoveries: number;
  sent: boolean;
  /** 보낼 것이 있었지만 못 보낸 이유 (수신자 미설정 등) */
  skipped_reason: string | null;
}

export interface AlertLog {
  id: number;
  watch_id: number | null;
  keyword: string;
  device: string;
  alert_type: 'drop' | 'recovered';
  target_rank: number;
  curr_rank: number | null;
  prev_rank: number | null;
  breach_streak: number;
  recipients: string;
  status: string;
  error_msg: string | null;
  created_at: string;
}

export interface AlertLogListResponse {
  items: AlertLog[];
  total: number;
}

export interface WatchCreateResult {
  keyword: string;
  device: WatchDevice;
  status: 'created' | 'skipped' | 'error';
  reason: string | null;
  id: number | null;
}

export interface WatchBulkCreateResponse {
  results: WatchCreateResult[];
  created: number;
  skipped: number;
  errors: number;
}

/** PATCH — 보낸 필드만 반영된다 */
export interface WatchUpdatePayload {
  target_rank?: number;
  tolerance?: number;
  breaches_required?: number;
  cooldown_hours?: number;
  alert_on_no_impression?: boolean;
  color_tag?: string | null;
  status?: WatchStatus;
}

export interface RankHistoryResponse {
  watch: RankWatch;
  items: RankSnapshot[];
}

export interface SnapshotUploadResponse {
  stat_date: string;
  matched_watches: number;
  inserted: number;
  updated: number;
  /** 보고서에는 있는데 감시 등록이 안 된 키워드 — "이것도 감시할까요" 제안 재료 */
  unmatched_keywords: string[];
  /** 감시 중인데 이번 보고서에 데이터가 없던 키워드 */
  watches_no_data: string[];
  alerts: AlertSummary;
}
