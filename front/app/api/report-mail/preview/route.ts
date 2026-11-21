import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 발송 전 미리보기 — 실제로 나갈 메일과 같은 제목·코멘트·HTML을 받아온다 (발송 없음). */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/report-mail/preview' });
}
