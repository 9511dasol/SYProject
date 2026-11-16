import { signOut } from 'next-auth/react';

import { messageFromBody } from './responseError';

/** 조회성 요청의 기본 상한. 서버가 응답하지 않을 때 무한정 매달리지 않게 한다. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** 이미지 생성처럼 수십 초가 정상인 작업용. 끊지 않고 사용자 취소에만 맡긴다. */
export const NO_TIMEOUT = 0;

export interface AuthFetchInit extends RequestInit {
  /** 이 시간이 지나면 요청을 끊는다. NO_TIMEOUT 이면 끄기. */
  timeoutMs?: number;
}

/**
 * 타임아웃과 호출부의 취소 신호를 하나로 합친다.
 *
 * 둘 중 먼저 울리는 쪽이 요청을 끊어야 한다 — 사용자가 취소 버튼을 눌렀을 때와
 * 서버가 응답하지 않을 때를 같은 경로로 처리하기 위함이다.
 *
 * AbortSignal.any 에 기대지 않고 직접 합친다. any 는 비교적 최신 API 라
 * 없는 브라우저에서는 "호출부가 signal 을 넘기면 타임아웃이 통째로 사라지는"
 * 조용한 구멍이 생긴다 — 상한이 브라우저에 따라 있다가 없다가 하면 안 된다.
 *
 * 반환한 cancel 은 요청이 끝난 뒤 꼭 불러야 타이머가 남지 않는다.
 */
function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number) {
  if (!timeoutMs) return { signal: signal ?? undefined, cancel: () => {} };

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('요청 시간이 초과되었습니다.', 'TimeoutError')),
    timeoutMs,
  );
  const cancel = () => clearTimeout(timer);

  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return { signal: controller.signal, cancel };
}

/** 사용자가 직접 취소한 경우(타임아웃이 아니라) — 화면에 오류로 띄우지 않기 위해 구분한다. */
export function isUserCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * fetch()로 BFF Route Handler(/api/**)를 직접 호출하는 클라이언트 컴포넌트용 래퍼.
 * accessToken은 서버에서 자동 갱신되지만, 갱신으로 해결되지 않는 사유로 401이 오면
 * 세션을 정리하고 소개 페이지('/')로 보낸다. 반환하는 Response는 그대로 기존 호출부에서 처리하면 된다.
 *
 * 예전에는 상한이 없어서, 백엔드가 멈추면 사용자는 로딩 스피너를 보며 기다리는 것
 * 외에 할 수 있는 게 없었다.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: AuthFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const limited = withTimeout(signal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(input, { ...rest, signal: limited.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    limited.cancel();
  }

  if (response.status === 401) {
    signOut({ callbackUrl: '/' });
  }
  return response;
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
  init?: AuthFetchInit,
  fallbackMessage = '요청을 처리하지 못했습니다.',
): Promise<T> {
  const res = await authFetch(input, init);

  // 204 No Content 등 바디가 없는 성공 응답
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(messageFromBody(body, fallbackMessage));
  }
  return body as T;
}

/**
 * JSON 바디를 실어 보내는 변형 — headers·body·method 를 매번 적지 않아도 된다.
 *
 * options 로 timeoutMs 를 넘길 수 있다. 서버에서 오래 걸리면서 **되돌릴 수 없는**
 * 작업(메일 재발송, 기간 삭제)은 기본 상한을 쓰면 안 된다 — 브라우저가 요청을 끊어도
 * 서버 작업은 계속 진행되므로, 사용자에게는 실패로 보이지만 실제로는 수행된다.
 */
export function sendJson<T>(
  input: RequestInfo | URL,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  fallbackMessage?: string,
  options?: Pick<AuthFetchInit, 'timeoutMs' | 'signal'>,
): Promise<T> {
  return fetchJson<T>(
    input,
    {
      method,
      ...options,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    },
    fallbackMessage,
  );
}
