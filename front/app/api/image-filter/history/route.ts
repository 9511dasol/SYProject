import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 내가 보낸 이미지 편집 지시 기록 (쿼리스트링 그대로 전달). */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, {
    backendPath: '/api/image-filter/history',
  });
}
