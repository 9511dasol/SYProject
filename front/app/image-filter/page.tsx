import type { Metadata } from 'next';
import ImageFilterClient from './ImageFilterClient';

export const metadata: Metadata = {
  title: 'AI 이미지 정제',
  description: 'GPT-4o가 조건을 분석해 맞는 이미지만 리사이징합니다.',
};

export default function ImageFilterPage() {
  return <ImageFilterClient />;
}
