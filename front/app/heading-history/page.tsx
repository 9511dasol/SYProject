import type { Metadata } from 'next';
import HeadingHistoryClient from '@/app/heading-history/HeadingHistoryClient';
import AuthGate from '@/components/ui/AuthGate';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: '헤딩 문구 기록',
  description: '생성한 매체별 헤딩 문구를 모아 보고 검색·복사·삭제',
};

export default function HeadingHistoryPage() {
  return (
    <AuthGate>
      <FeatureGate flag="is_heading_suggest_enabled">
        <HeadingHistoryClient />
      </FeatureGate>
    </AuthGate>
  );
}
