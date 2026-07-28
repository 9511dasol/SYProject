"""rate limit 키 산출 규칙.

인증된 요청은 사용자 단위로 세고, 그 외에는 IP 단위로 센다.
위조된 토큰이 사용자 키로 인정되면 카운터를 무한히 우회할 수 있으므로
서명 검증을 통과한 토큰만 사용자 키가 되어야 한다.
"""

import jwt
import pytest
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from app.core import rate_limit
from app.core.security import create_access_token
from app.core.settings import settings


def _request(headers: dict[str, str] | None = None, client_host: str = "203.0.113.7") -> Request:
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (client_host, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    })


def test_anonymous_request_keys_on_client_ip():
    assert rate_limit.user_or_ip_key(_request()) == "ip:203.0.113.7"


def test_forwarded_for_used_when_proxy_trusted(monkeypatch):
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _request({"X-Forwarded-For": "198.51.100.4, 10.0.0.1"})
    assert rate_limit.user_or_ip_key(req) == "ip:198.51.100.4"


def test_forwarded_for_ignored_when_proxy_untrusted(monkeypatch):
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    req = _request({"X-Forwarded-For": "198.51.100.4"})
    assert rate_limit.user_or_ip_key(req) == "ip:203.0.113.7"


def test_valid_token_keys_on_user():
    token = create_access_token(subject="42")
    req = _request({"Authorization": f"Bearer {token}"})
    assert rate_limit.user_or_ip_key(req) == "user:42"


def test_forged_token_falls_back_to_ip():
    """다른 키로 서명한 토큰은 사용자 키로 인정하지 않는다."""
    forged = jwt.encode({"sub": "99", "type": "access"}, "attacker-key" * 4, algorithm="HS256")
    req = _request({"Authorization": f"Bearer {forged}"})
    assert rate_limit.user_or_ip_key(req) == "ip:203.0.113.7"


def test_refresh_token_is_not_accepted_as_user_key():
    """access 토큰이 아닌 것은 사용자 키가 되지 않는다."""
    refresh = jwt.encode(
        {"sub": "42", "type": "refresh"}, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    req = _request({"Authorization": f"Bearer {refresh}"})
    assert rate_limit.user_or_ip_key(req) == "ip:203.0.113.7"


# ── 한도 초과 시 실제로 429가 나가는지 (main.py의 배선과 동일한 구성) ──────────


@pytest.fixture
def limited_client() -> TestClient:
    app = FastAPI()
    app.state.limiter = rate_limit.limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.post("/limited")
    @rate_limit.limiter.limit("3/minute")
    def _limited(request: FastAPIRequest):  # noqa: ARG001 — slowapi가 request를 요구한다
        return {"ok": True}

    return TestClient(app)


def test_requests_over_limit_get_429(limited_client):
    headers = {"X-Forwarded-For": "192.0.2.55"}  # 다른 테스트와 카운터가 섞이지 않게
    for _ in range(3):
        assert limited_client.post("/limited", headers=headers).status_code == 200

    response = limited_client.post("/limited", headers=headers)
    assert response.status_code == 429


def test_separate_keys_have_separate_counters(limited_client):
    for _ in range(3):
        limited_client.post("/limited", headers={"X-Forwarded-For": "192.0.2.56"})

    # 다른 IP는 아직 한도를 쓰지 않았다
    assert limited_client.post("/limited", headers={"X-Forwarded-For": "192.0.2.57"}).status_code == 200
