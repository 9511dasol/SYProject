/** 기능 플래그 — 키 목록은 백엔드 OpenAPI 에서 생성된 것을 가리킨다.
 *
 *  예전에는 이 유니온을 손으로 적어 두고 백엔드(system_settings)와 맞춰야 했다.
 *  이제 백엔드에 플래그를 추가하고 `npm run types:generate` 만 돌리면 따라온다.
 */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type FeatureFlagItem = S['FeatureFlagOut'];
export type FeatureFlagKey = FeatureFlagItem['key'];

/** GET /api/settings/flags 응답 — key → on/off.
 *  이 엔드포인트는 DB 에 있는 키를 그대로 돌려주므로(코드가 모르는 키도 올 수 있다)
 *  좁은 유니온이 아니라 문자열 키로 받는다. */
export type FeatureFlags = Record<string, boolean>;
