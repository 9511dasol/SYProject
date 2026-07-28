import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 리포트 메일 발송 이력을 조회한다. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/report-mail/logs' });
}
