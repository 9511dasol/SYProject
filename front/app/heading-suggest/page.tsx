import type { Metadata } from 'next';
import ComingSoon from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: '헤딩 문구 추천' };

const ITEM = {
  id: 'heading-suggest',
  label: '헤딩 문구 추천',
  icon: 'bx-bulb',
  href: '/heading-suggest',
  description:
    '헤딩 이미지에 맞는 문구를 매체별(메타·구글·네이버) 스타일로 최대 10개 추천합니다. 메타는 이모지 포함, 90자 이내.',
} as const;

export default function HeadingSuggestPage() {
  return <ComingSoon item={ITEM} />;
}
