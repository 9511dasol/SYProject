/** AI 도구 사용 이력 — 백엔드 OpenAPI 에서 생성된 타입을 가리킨다.
 *
 *  AIToolKey 도 더 이상 손으로 적지 않는다. 예전에는 백엔드
 *  (app/services/ai_usage.py)의 값과 짝을 손으로 맞춰야 했고,
 *  새 도구가 늘어도 화면은 모른 채 지나갔다.
 */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type AIToolUsageLogItem = S['AIToolUsageLogOut'];
export type AIToolKey = AIToolUsageLogItem['tool'];
export type AIToolUsageLogListResponse = S['AIToolUsageLogListResponse'];
export type AIUsageSummary = S['AIUsageSummaryResponse'];
