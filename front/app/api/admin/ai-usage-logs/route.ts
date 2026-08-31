import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: AI 도구 사용 이력 목록 (limit · offset · tool 쿼리스트링은 그대로 전달된다) */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/ai-usage-logs' });
}
