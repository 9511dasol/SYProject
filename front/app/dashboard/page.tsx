import type { Metadata } from 'next';
import DashboardClient from '@/app/dashboard/DashboardClient';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: 'SA 광고 대시보드',
  description: '매체 데이터 분석 및 리포트 조회',
};

export default function DashboardPage() {
  return (
    <FeatureGate flag="is_dashboard_enabled">
      <DashboardClient />
    </FeatureGate>
  );
}
