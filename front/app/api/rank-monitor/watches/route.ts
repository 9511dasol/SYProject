import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 감시 키워드 목록 (최신 스냅샷 포함). */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/watches' });
}

/** BFF: 감시 키워드 등록 (단건·대량, 행별 결과 응답). */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/watches' });
}
