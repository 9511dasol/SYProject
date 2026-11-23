/** 헤딩 문구 추천 — 응답 타입은 백엔드 OpenAPI 에서 생성된 것을 가리킨다. */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type HeadingItem = S['HeadingItem'];
export type Platform = HeadingItem['platform'];
export type HeadingSuggestionRecord = S['HeadingSuggestionRecord'];
export type HeadingHistoryResponse = S['HeadingHistoryResponse'];

/** 생성 응답 — 기록 한 건을 그대로 돌려준다 */
export type HeadingResponse = HeadingSuggestionRecord;

// ── 화면 전용 타입 (API 계약이 아니다) ────────────────────────────────────────

/** 탭 필터 — '전체'는 화면에만 있는 값이라 생성 타입에 없다 */
export type PlatformFilter = '전체' | Platform;

export type HeadingLoadingState = 'idle' | 'compressing' | 'analyzing';
