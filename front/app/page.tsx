import type { Metadata } from 'next';
import HomeClient from '@/app/HomeClient';

export const metadata: Metadata = {
  title: 'SA 광고 대시보드',
  description: '매체 데이터 분석 및 리포트 조회',
};

export default function HomePage() {
  return <HomeClient />;
}
