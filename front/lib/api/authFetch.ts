import { signOut } from 'next-auth/react';

/**
 * fetch()로 BFF Route Handler(/api/**)를 직접 호출하는 클라이언트 컴포넌트용 래퍼.
 * accessToken은 서버에서 자동 갱신되지만, 갱신으로 해결되지 않는 사유로 401이 오면
 * 세션을 정리하고 소개 페이지('/')로 보낸다. 반환하는 Response는 그대로 기존 호출부에서 처리하면 된다.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    signOut({ callbackUrl: '/' });
  }
  return response;
}
