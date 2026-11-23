import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 자동 수집 설정 상태 (API 키 연결 여부). */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/collect/status' });
}
