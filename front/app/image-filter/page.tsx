import type { Metadata } from 'next';
import ComingSoon from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: '이미지 정제' };

const ITEM = {
  id: 'image-filter',
  label: '이미지 정제',
  icon: 'bx-filter-alt',
  href: '/image-filter',
  description: '세부 조건을 설정해 원하는 이미지만 선별하고 잡스러운 결과를 제거합니다.',
} as const;

export default function ImageFilterPage() {
  return <ComingSoon item={ITEM} />;
}
