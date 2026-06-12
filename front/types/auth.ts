export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  image?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

/** GET/PATCH /api/auth/me 응답 — 프로필 페이지 표시용 */
export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

/** PATCH /api/auth/me 요청 본문 */
export interface ProfileUpdatePayload {
  name?: string;
  email?: string;
}

/** POST /api/auth/me/password 요청 본문 */
export interface PasswordChangePayload {
  current_password: string;
  new_password: string;
}
