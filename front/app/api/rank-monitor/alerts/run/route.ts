import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 지금 상태로 알림을 평가해 발송. */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/alerts/run' });
}
