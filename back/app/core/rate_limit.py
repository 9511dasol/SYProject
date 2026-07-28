"""요청 빈도 제한 (slowapi).

두 가지 남용을 막는 것이 목적이다.
  1. `/api/auth/login` 무차별 대입 — IP 단위로 분당 시도 횟수를 제한한다.
     (계정 단위 잠금은 app/repositories/user_repo.py의 로그인 실패 카운터가 담당한다.
      IP는 프록시 헤더로 위조할 수 있어 이것만으로는 충분하지 않기 때문이다.)
  2. LLM 호출 엔드포인트 — 한 사용자가 반복 호출하면 그대로 API 과금이 발생한다.

저장소는 기본값이 프로세스 메모리(`memory://`)라 인스턴스마다 카운터가 따로 논다.
인스턴스를 여러 개 띄운다면 `RATE_LIMIT_STORAGE_URI=redis://...`로 공유 저장소를
지정하는 것을 권장한다.
"""

from fastapi import Request
from slowapi import Limiter

from app.core.security import decode_access_token
from app.core.settings import settings


def client_ip(request: Request) -> str:
    """클라이언트 IP. 프록시(Cloud Run/Vercel) 뒤에 있으면 X-Forwarded-For를 본다.

    X-Forwarded-For는 클라이언트가 위조할 수 있으므로 신뢰 경계로 쓰면 안 된다 —
    여기서는 어디까지나 "정상 사용자가 실수로 도배하는 것"과 "단순 스크립트 공격"을
    걸러내는 용도이고, 계정 보호는 로그인 실패 카운터가 맡는다.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def user_or_ip_key(request: Request) -> str:
    """인증된 요청은 사용자 단위로, 그 외에는 IP 단위로 센다.

    Authorization 헤더의 토큰은 서명까지 검증한 뒤에만 키로 쓴다 — 검증 없이 payload만
    읽으면 아무 값이나 넣어 카운터를 우회할 수 있다.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            subject = decode_access_token(auth_header[7:]).get("sub")
        except Exception:
            subject = None
        if subject:
            return f"user:{subject}"
    return f"ip:{client_ip(request)}"


# headers_enabled는 켜지 않는다 — 켜면 slowapi가 X-RateLimit-* 헤더를 넣기 위해
# 모든 대상 엔드포인트에 `response: Response` 파라미터를 요구하고, 없으면 요청이
# 429가 아니라 500으로 실패한다. 한도 초과 응답 자체(429 + Retry-After)는 그대로 나간다.
limiter = Limiter(
    key_func=user_or_ip_key,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    enabled=settings.RATE_LIMIT_ENABLED,
)
