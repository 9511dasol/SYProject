import { authFetch, fetchJson, NO_TIMEOUT, sendJson } from '@/lib/api/authFetch';
import { extractResponseError } from '@/lib/api/responseError';
import type {
  AlertLogListResponse,
  AlertSummary,
  RankHistoryResponse,
  RankWatchListResponse,
  SnapshotUploadResponse,
  WatchBulkCreateResponse,
  WatchCreateItem,
  WatchUpdatePayload,
} from '@/types/rankMonitor';

/** 감시 키워드 목록 (최신 스냅샷 포함). */
export function fetchRankWatches(): Promise<RankWatchListResponse> {
  return fetchJson<RankWatchListResponse>(
    '/api/rank-monitor/watches',
    undefined,
    '감시 키워드 목록을 불러오지 못했습니다.',
  );
}

/** 감시 키워드 등록 — 일부가 중복이어도 행별 결과로 돌아온다. */
export function createRankWatches(items: WatchCreateItem[]): Promise<WatchBulkCreateResponse> {
  return sendJson<WatchBulkCreateResponse>(
    '/api/rank-monitor/watches',
    'POST',
    { items },
    '감시 키워드를 등록하지 못했습니다.',
  );
}

/** 감시 설정 부분 수정 (목표 순위 · 일시정지 등). */
export function updateRankWatch(id: number, payload: WatchUpdatePayload) {
  return sendJson(
    `/api/rank-monitor/watches/${id}`,
    'PATCH',
    payload,
    '감시 설정을 수정하지 못했습니다.',
  );
}

/** 감시와 순위 이력을 함께 삭제한다 (되돌릴 수 없음). */
export function deleteRankWatch(id: number) {
  return sendJson(
    `/api/rank-monitor/watches/${id}`,
    'DELETE',
    undefined,
    '감시 키워드를 삭제하지 못했습니다.',
  );
}

/** 순위 이력 — 그래프용 날짜 오름차순. */
export function fetchRankHistory(id: number, limit = 90): Promise<RankHistoryResponse> {
  return fetchJson<RankHistoryResponse>(
    `/api/rank-monitor/watches/${id}/history?limit=${limit}`,
    undefined,
    '순위 이력을 불러오지 못했습니다.',
  );
}

/** 키워드 보고서(CSV/Excel)를 해당 날짜의 순위로 적재한다. 같은 날짜 재업로드는 갱신. */
export async function uploadRankReport(
  file: File,
  statDate: string,
): Promise<SnapshotUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('stat_date', statDate);

  const res = await authFetch('/api/rank-monitor/snapshots/upload', {
    method: 'POST',
    body: form,
    // 적재 뒤 알림 메일 발송까지 한 요청 안에서 끝난다 — SMTP 가 느린 날
    // 기본 상한(30초)에 걸리면 사용자는 실패로 보고 같은 파일을 다시 올린다.
    timeoutMs: NO_TIMEOUT,
  });
  if (!res.ok) {
    throw new Error(await extractResponseError(res, '보고서를 적재하지 못했습니다.'));
  }
  return (await res.json()) as SnapshotUploadResponse;
}

/** 알림 발송 이력 (watchId 를 주면 그 감시의 것만). */
export function fetchRankAlerts(watchId?: number, limit = 20): Promise<AlertLogListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (watchId !== undefined) params.set('watch_id', String(watchId));
  return fetchJson<AlertLogListResponse>(
    `/api/rank-monitor/alerts?${params.toString()}`,
    undefined,
    '알림 이력을 불러오지 못했습니다.',
  );
}

/** 지금 상태로 알림을 평가해 보낸다 (설정을 고친 뒤 확인용). */
export function runRankAlerts(): Promise<AlertSummary> {
  return sendJson<AlertSummary>(
    '/api/rank-monitor/alerts/run',
    'POST',
    undefined,
    '알림을 평가하지 못했습니다.',
    // 메일 발송을 포함하므로 조회 상한을 걸지 않는다 (끊겨도 서버는 계속 보낸다).
    { timeoutMs: NO_TIMEOUT },
  );
}
