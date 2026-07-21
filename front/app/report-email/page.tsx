import type { Metadata } from 'next';
import ReportEmailClient from './ReportEmailClient';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: '코멘트 & 리포트 메일',
  description: '분석 데이터를 기반으로 AI 코멘트를 생성하고 리포트 메일을 발송합니다.',
};

export default function ReportEmailPage() {
  return (
    <FeatureGate flag="is_report_email_enabled">
      <ReportEmailClient />
    </FeatureGate>
  );
}
