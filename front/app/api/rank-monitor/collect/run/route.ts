import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 네이버 API로 순위를 지금 수집 (쿼리스트링 force_resolve 는 그대로 전달된다). */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/collect/run' });
}
