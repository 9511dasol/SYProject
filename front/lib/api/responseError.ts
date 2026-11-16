/**
 * 백엔드 오류 응답에서 사람이 읽을 메시지를 꺼낸다.
 *
 * 응답 봉투가 두 가지다 — FastAPI 는 `detail`, BFF Route Handler 는 `message`.
 * 이 "json 읽고 detail ?? message 로 꺼내기" 블록이 클라이언트 파일 8곳에 복제돼
 * 있었고, 파일마다 우선순위가 달라(어떤 곳은 message 먼저) 백엔드가 준 사유를
 * 잃는 경우가 있었다. 한 곳으로 모아 순서를 고정한다.
 */
export async function extractResponseError(res: Response, fallback?: string): Promise<string> {
  const base = fallback ?? `서버 오류: ${res.status}`;
  try {
    const json: unknown = await res.json();
    if (json && typeof json === 'object') {
      const { detail, message } = json as { detail?: unknown; message?: unknown };
      if (typeof detail === 'string' && detail) return detail;
      if (typeof message === 'string' && message) return message;
    }
  } catch {
    // 본문이 비었거나 JSON 이 아니면(502 HTML 등) 기본 문구를 쓴다
  }
  return base;
}

/** 실패 응답을 백엔드 메시지를 담은 Error 로 바꿔 던진다. */
export async function throwResponseError(res: Response, fallback?: string): Promise<never> {
  throw new Error(await extractResponseError(res, fallback));
}
