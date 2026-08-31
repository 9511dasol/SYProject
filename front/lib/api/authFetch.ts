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

/**
 * 백엔드 에러 응답에서 사람이 읽을 메시지를 꺼낸다.
 *
 * 응답 봉투가 두 가지다 — FastAPI 는 `detail`, BFF Route Handler 는 `message`.
 * 그동안 화면마다 한쪽만 읽어서(`data.message ?? fallback` 형태가 10곳) 백엔드가 준
 * 원래 사유를 잃고 "조회 실패" 같은 기본 문구만 보여주는 경우가 많았다. 둘 다 본다.
 */
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const { detail, message } = body as { detail?: unknown; message?: unknown };
    if (typeof detail === 'string' && detail) return detail;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * BFF 라우트를 호출해 JSON을 돌려준다. 실패하면 백엔드 메시지를 담아 throw 한다.
 *
 * 이 fetch → json → `if (!res.ok) throw` 사다리가 화면 7곳에 복제돼 있었다.
 * throw 하는 이유는 TanStack Query 가 거부(rejection)를 에러 상태로 다루기 때문이다 —
 * queryFn 으로 그대로 넘기면 error·isLoading 을 따로 관리할 필요가 없다.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage = '요청을 처리하지 못했습니다.',
): Promise<T> {
  const res = await authFetch(input, init);

  // 204 No Content 등 바디가 없는 성공 응답
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(extractMessage(body, fallbackMessage));
  }
  return body as T;
}

/** JSON 바디를 실어 보내는 변형 — headers·body·method 를 매번 적지 않아도 된다. */
export function sendJson<T>(
  input: RequestInfo | URL,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  fallbackMessage?: string,
): Promise<T> {
  return fetchJson<T>(
    input,
    {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    },
    fallbackMessage,
  );
}
