import type { Metadata } from 'next';
import ComingSoon from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: '파일 비교 분석' };

const ITEM = {
  id: 'file-compare',
  label: '파일 비교 분석',
  icon: 'bx-transfer-alt',
  href: '/file-compare',
  description: '두 파일을 업로드해 차이점을 분석하고 코멘트를 작성합니다.',
} as const;

export default function FileComparePage() {
  return <ComingSoon item={ITEM} />;
}
