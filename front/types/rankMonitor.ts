/**
 * 키워드 순위 모니터링 타입.
 *
 * 모든 응답 타입은 백엔드 OpenAPI 에서 생성된 `api.generated.ts` 를 가리킨다.
 * 손으로 적어 두면 백엔드가 바뀌어도 화면은 모르고 넘어가다가 런타임에 터지는데,
 * 이렇게 두면 `npm run types:generate` 한 번에 어긋난 곳이 전부 타입 오류로 드러난다.
 *
 * 여기 남는 것은 **이름뿐**이다 — 화면 코드가 `components['schemas']['WatchOut']`
 * 같은 긴 경로를 쓰지 않도록 읽기 쉬운 이름을 붙여 준다.
 */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type WatchDevice = S['WatchOut']['device'];
export type WatchStatus = S['WatchOut']['status'];

export type RankSnapshot = S['SnapshotOut'];
export type RankWatch = S['WatchOut'];
export type RankWatchListResponse = S['WatchListResponse'];

export type WatchCreateItem = S['WatchCreateItem'];
export type WatchCreateResult = S['WatchCreateResult'];
export type WatchBulkCreateResponse = S['WatchBulkCreateResponse'];
export type WatchUpdatePayload = S['WatchUpdate'];

export type RankHistoryResponse = S['WatchHistoryResponse'];
export type SnapshotUploadResponse = S['SnapshotUploadResponse'];

export type AlertSummary = S['AlertSummary'];
export type AlertLog = S['AlertLogOut'];
export type AlertLogListResponse = S['AlertLogListResponse'];

export type CollectStatus = S['CollectStatus'];
export type CollectResponse = S['CollectResponse'];

export type BidRow = S['BidRowOut'];
export type BidEstimateResponse = S['BidEstimateResponse'];
export type KeywordInsight = S['KeywordInsightResponse'];
