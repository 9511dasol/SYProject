import { signOut } from 'next-auth/react';

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
 * 서버가 응답하지 않을 때를 모두 같은 경로로 처리하기 위함이다.
 */
function combineSignals(signal: AbortSignal | null | undefined, timeoutMs: number) {
  if (!timeoutMs || typeof AbortSignal?.timeout !== 'function') return signal ?? undefined;

  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  return signal; // 합칠 수 없으면 사용자의 취소를 우선한다
}

/** 중단된 요청인지 — 타임아웃(TimeoutError)과 사용자 취소(AbortError) 둘 다. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
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

  let response: Response;
  try {
    response = await fetch(input, { ...rest, signal: combineSignals(signal, timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw error;
  }

  if (response.status === 401) {
    signOut({ callbackUrl: '/' });
  }
  return response;
}

/**
 * 이미 읽어 둔 본문에서 사람이 읽을 메시지를 꺼낸다.
 *
 * 응답 봉투가 두 가지다 — FastAPI 는 `detail`, BFF Route Handler 는 `message`.
 * 꺼내는 순서는 responseError.extractResponseError 와 같아야 한다(한쪽만 고치면
 * 같은 오류가 화면마다 다른 문구로 보인다).
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
  init?: AuthFetchInit,
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
