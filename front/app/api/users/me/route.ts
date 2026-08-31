import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

// 프론트 경로(/api/users/me)와 백엔드 경로(/api/auth/me)가 다르다.
const BACKEND_PATH = '/api/auth/me';

/** BFF: 로그인한 사용자의 프로필을 조회한다. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: BACKEND_PATH });
}

/** BFF: 프로필 페이지에서 이름 · 이메일을 수정한다. */
export async function PATCH(request: NextRequest) {
  return proxyToBackend(request, { backendPath: BACKEND_PATH });
}
