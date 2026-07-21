import type { UserRole } from '@/types/auth';

/** GET /api/admin/users 항목 */
export interface AdminUserItem {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

/** POST /api/admin/users 요청 본문 — 운영 계정 직접 생성 */
export interface AdminUserCreatePayload {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

/** PATCH /api/admin/users/{id}/profile 요청 본문 — 이름 · 이메일 변경 */
export interface AdminUserProfileUpdatePayload {
  name?: string;
  email?: string;
}

/** POST /api/admin/users/{id}/reset-password 요청 본문 — 비밀번호 강제 재설정 */
export interface AdminUserPasswordResetPayload {
  new_password: string;
}
