import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자가 AI 도구(Gemini) 월간 토큰 예산(내부 참고용 목표치)을 설정한다. */
export async function PATCH(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/ai-usage-logs/budget' });
}
