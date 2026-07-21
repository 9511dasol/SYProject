import type { Metadata } from 'next';
import FileCompareClient from './FileCompareClient';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: '키워드 성과 비교',
  description: '이번/이전 기간 키워드 전환 성과를 자동으로 비교·분석합니다.',
};

export default function FileComparePage() {
  return (
    <FeatureGate flag="is_keyword_compare_enabled">
      <FileCompareClient />
    </FeatureGate>
  );
}
