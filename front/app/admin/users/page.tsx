import type { Metadata } from 'next';
import AdminUsersClient from '@/app/admin/users/AdminUsersClient';

export const metadata: Metadata = {
  title: '사용자 관리',
  description: '계정 목록 조회 및 권한 · 활성 상태 관리, 운영 계정 생성',
};

export default function AdminUsersPage() {
  return <AdminUsersClient />;
}
