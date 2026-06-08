import type { Metadata } from 'next';
import HeadingSuggestClient from './HeadingSuggestClient';

export const metadata: Metadata = {
  title: 'AI 헤딩 문구 추천',
  description: 'Claude가 이미지를 분석해 매체별 마케팅 헤딩 문구 10개를 제안합니다.',
};

export default function HeadingSuggestPage() {
  return <HeadingSuggestClient />;
}
