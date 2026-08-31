import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 리포트 메일 발송 이력 목록 (limit · offset · status 쿼리스트링은 그대로 전달된다) */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/report-logs' });
}
