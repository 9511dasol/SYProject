import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 연월별 저장 데이터 현황 목록 */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/periods' });
}
