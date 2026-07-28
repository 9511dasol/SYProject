import type { Metadata } from 'next';
import AdminPeriodsClient from '@/app/admin/periods/AdminPeriodsClient';

export const metadata: Metadata = {
  title: '업로드 데이터 관리',
  description: '연월별 마케팅 데이터 현황 조회 및 삭제',
};

export default function AdminPeriodsPage() {
  return <AdminPeriodsClient />;
}
