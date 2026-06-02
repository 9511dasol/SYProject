import type { Metadata } from 'next';
import ComingSoon from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: '이미지 리사이저' };

const ITEM = {
  id: 'image-resize',
  label: '이미지 리사이저',
  icon: 'bx-crop',
  href: '/image-resize',
  description: 'JPEG · PNG 파일을 원하는 사이즈로 변환합니다. 로고 없이 깔끔하게 출력됩니다.',
} as const;

export default function ImageResizePage() {
  return <ComingSoon item={ITEM} />;
}
