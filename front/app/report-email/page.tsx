import type { Metadata } from 'next';
import ComingSoon from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: '코멘트 & 리포트 메일' };

const ITEM = {
  id: 'report-email',
  label: '코멘트 & 리포트 메일',
  icon: 'bx-mail-send',
  href: '/report-email',
  description: '분석 기반 코멘트를 작성하고 Excel 파일로 만들어 메일로 발송합니다.',
} as const;

export default function ReportEmailPage() {
  return <ComingSoon item={ITEM} />;
}
