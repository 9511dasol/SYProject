import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자 페이지에서 전체 계정 목록을 조회한다. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/users' });
}

/** BFF: 관리자가 운영 계정을 직접 생성한다. */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/users' });
}
