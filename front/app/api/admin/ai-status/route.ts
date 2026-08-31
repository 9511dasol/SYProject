import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자 화면에서 LLM 프로바이더와 API 키 설정 여부를 조회한다. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/ai-status' });
}
