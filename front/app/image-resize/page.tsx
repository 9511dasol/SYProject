import type { Metadata } from 'next';
import ImageResizeClient from '@/components/image-resize/ImageResizeClient';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: '이미지 리사이저',
  description: 'JPEG · PNG · WebP 이미지를 원하는 크기로 무료 변환합니다.',
};

export default function ImageResizePage() {
  return (
    <FeatureGate flag="is_image_resize_enabled">
      <ImageResizeClient />
    </FeatureGate>
  );
}
