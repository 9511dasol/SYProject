import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/**
 * BFF: dev(플랫폼 운영자) 전용 API 전체를 하나의 캐치올로 중계한다.
 *
 * /api/dev/* 는 엔드포인트가 많고 전부 같은 모양의 얇은 프록시라, 관리자 BFF처럼
 * 파일을 경로마다 두면 라우트 파일 10여 개가 전부 두 줄짜리 복사본이 된다.
 * 권한(require_dev)은 FastAPI 쪽이 검증한다 — 여기는 세션 토큰만 싣는다.
 */
type Params = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, { params }: Params) {
  const { path } = await params;
  const backendPath = `/api/dev/${path.map(encodeURIComponent).join('/')}`;
  return proxyToBackend(request, { backendPath });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
