import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 리포트 메일 발송을 요청한다 (FastAPI가 백그라운드로 처리). */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/report-mail/send' });
}
