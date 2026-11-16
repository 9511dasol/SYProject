/**
 * 이미 읽어 둔 응답 본문에서 사람이 읽을 메시지를 꺼낸다.
 *
 * 응답 봉투가 두 가지다 — FastAPI 는 `detail`, BFF Route Handler 는 `message`.
 * 이 "detail ?? message 로 꺼내기" 블록이 클라이언트 파일 8곳에 복제돼 있었고,
 * 파일마다 우선순위가 달라(어떤 곳은 message 먼저) 백엔드가 준 사유를 잃는 경우가
 * 있었다. 한 곳으로 모아 순서를 고정한다.
 *
 * 본문을 직접 받는 형태인 이유는, 바디를 한 번만 읽을 수 있기 때문이다 —
 * fetchJson 처럼 이미 text() 로 읽어 둔 쪽도 같은 규칙을 쓸 수 있어야 한다.
 */
export function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const { detail, message } = body as { detail?: unknown; message?: unknown };
    if (typeof detail === 'string' && detail) return detail;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/** 아직 읽지 않은 실패 응답에서 메시지를 꺼낸다. */
export async function extractResponseError(res: Response, fallback?: string): Promise<string> {
  const base = fallback ?? `서버 오류: ${res.status}`;
  try {
    return messageFromBody(await res.json(), base);
  } catch {
    // 본문이 비었거나 JSON 이 아니면(502 HTML 등) 기본 문구를 쓴다
    return base;
  }
}

/** 실패 응답을 백엔드 메시지를 담은 Error 로 바꿔 던진다. */
export async function throwResponseError(res: Response, fallback?: string): Promise<never> {
  throw new Error(await extractResponseError(res, fallback));
}
