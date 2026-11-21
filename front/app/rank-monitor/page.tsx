import type { Metadata } from 'next';
import RankMonitorClient from '@/app/rank-monitor/RankMonitorClient';
import AuthGate from '@/components/ui/AuthGate';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: '키워드 순위 모니터링',
  description: '키워드 노출 순위를 날짜별로 기록하고 목표 이탈을 감지합니다.',
};

export default function RankMonitorPage() {
  return (
    <AuthGate>
      <FeatureGate flag="is_rank_monitor_enabled">
        <RankMonitorClient />
      </FeatureGate>
    </AuthGate>
  );
}
