import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 이번 달 AI 도구(Gemini) 토큰 사용량 합계 + 관리자가 설정한 월간 예산을 조회한다. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/ai-usage-logs/summary' });
}
