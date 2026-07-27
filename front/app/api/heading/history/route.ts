import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 로그인한 사용자의 헤딩 문구 생성 기록 목록 조회. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/heading/history' });
}
