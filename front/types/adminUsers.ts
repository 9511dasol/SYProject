/** 사용자 관리(관리자) — 백엔드 OpenAPI 에서 생성된 타입을 가리킨다. */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type AdminUserItem = S['UserAdminOut'];
export type AdminUserCreatePayload = S['UserAdminCreate'];
export type AdminUserProfileUpdatePayload = S['UserProfileUpdate'];
export type AdminUserPasswordResetPayload = S['UserPasswordReset'];
