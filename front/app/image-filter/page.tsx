import type { Metadata } from 'next';
import ImageFilterClient from './ImageFilterClient';
import AuthGate from '@/components/ui/AuthGate';
import FeatureGate from '@/components/ui/FeatureGate';

export const metadata: Metadata = {
  title: 'AI 이미지 정제',
  description: '원하는 프롬프트를 입력하면 Gemini가 이미지를 편집하고 리사이징합니다.',
};

export default function ImageFilterPage() {
  return (
    <AuthGate>
      <FeatureGate flag="is_image_filter_enabled">
        <ImageFilterClient />
      </FeatureGate>
    </AuthGate>
  );
}
