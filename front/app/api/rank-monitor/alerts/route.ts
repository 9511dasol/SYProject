import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 순위 알림 발송 이력. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/alerts' });
}
