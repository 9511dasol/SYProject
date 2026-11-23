/** 인증·프로필 — 응답/요청 타입은 백엔드 OpenAPI 에서 생성된 것을 가리킨다. */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type UserProfile = S['UserOut'];
export type UserRole = UserProfile['role'];
export type LoginPayload = S['UserLogin'];
export type RegisterPayload = S['UserCreate'];
export type TokenResponse = S['TokenResponse'];
export type ProfileUpdatePayload = S['ProfileUpdate'];
export type PasswordChangePayload = S['PasswordChange'];

// ── 화면 전용 타입 (API 계약이 아니다) ────────────────────────────────────────

/** NextAuth 세션에 담기는 사용자 — id 가 문자열이고 image 가 붙는 등
 *  백엔드 응답과 모양이 달라 생성 타입을 그대로 쓸 수 없다. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  image?: string | null;
}
