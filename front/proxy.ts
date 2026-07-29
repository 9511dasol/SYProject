import { NextResponse } from 'next/server';
import { auth } from '@/auth';

// 인증 없이 접근 가능한 경로 (하위 경로까지 공개)
const PUBLIC_PATHS = ['/login'];

function isPublicPath(pathname: string) {
  // 제품 소개(랜딩) 페이지는 '/' 하나만 공개한다 — PUBLIC_PATHS에 '/'를 넣으면
  // startsWith('/') 때문에 앱 전체가 열려버리므로 여기서 따로 처리한다.
  if (pathname === '/') return true;

  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// 최적화(optimistic) 인증 체크: 쿠키에 담긴 세션만으로 빠르게 리다이렉트 여부를 결정한다.
// 실제 데이터 접근 권한 체크는 각 Route Handler/서버 컴포넌트에서 auth()로 다시 검증한다.
export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAdmin = req.auth?.user?.role === 'admin';
  const { pathname } = req.nextUrl;

  // 세션이 없으면 로그인 폼이 아니라 소개 페이지로 보낸다 —
  // 로그인은 그 페이지의 CTA에서 시작한다.
  if (!isLoggedIn && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin));
  }

  if (isLoggedIn && pathname === '/login') {
    const homeUrl = new URL(isAdmin ? '/admin/settings' : '/dashboard', req.nextUrl.origin);
    return NextResponse.redirect(homeUrl);
  }

  // 관리자 전용 경로 — admin이 아니면 접근 차단
  if (isLoggedIn && !isAdmin && pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl.origin));
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)'],
};
