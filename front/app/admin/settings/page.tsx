import type { Metadata } from 'next';
import AdminSettingsClient from '@/app/admin/settings/AdminSettingsClient';

export const metadata: Metadata = {
  title: '기능 플래그 관리',
  description: '서비스 기능을 켜고 끌 수 있는 관리자 설정 페이지',
};

export default function AdminSettingsPage() {
  return <AdminSettingsClient />;
}
