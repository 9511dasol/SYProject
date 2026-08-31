import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자 페이지에서 전체 기능 플래그 목록을 조회한다. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/settings' });
}
