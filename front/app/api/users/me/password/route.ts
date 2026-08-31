import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 프로필 페이지에서 비밀번호를 변경한다. */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/auth/me/password' });
}
