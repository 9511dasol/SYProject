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
