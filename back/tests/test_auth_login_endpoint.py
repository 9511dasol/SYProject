"""/api/auth/login 통합 동작.

레포지토리 단위 테스트(test_login_lockout)가 검증하는 잠금 로직이 실제로
HTTP 429로 번역되는지, 정상 로그인은 그대로 동작하는지 확인한다.

app.main 전체를 띄우면 lifespan이 실제 DB에 마이그레이션을 걸므로,
auth_router만 얹은 최소 앱에 SQLite 세션을 주입해서 검증한다.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limit import limiter
from app.core.security import get_db
from app.core.settings import settings
from app.models.user_model import User
from app.repositories.user_repo import UserRepository
from app.routers import auth_router

_EMAIL = "login-test@example.com"
_PASSWORD = "correct-horse-battery"


@pytest.fixture
def client():
    # TestClient는 동기 엔드포인트를 스레드풀에서 실행하므로, 같은 인메모리 DB를
    # 여러 스레드가 공유할 수 있게 StaticPool + check_same_thread=False 로 연다.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    Session = sessionmaker(bind=engine)

    session = Session()
    UserRepository(session).create_user(email=_EMAIL, password=_PASSWORD)

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(auth_router.router)
    app.dependency_overrides[get_db] = lambda: session

    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def _login(client: TestClient, password: str, ip: str):
    return client.post(
        "/api/auth/login",
        json={"email": _EMAIL, "password": password},
        headers={"X-Forwarded-For": ip},  # 테스트끼리 rate limit 카운터가 섞이지 않게
    )


def test_valid_credentials_return_tokens(client):
    response = _login(client, _PASSWORD, "198.51.100.10")
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["email"] == _EMAIL


def test_wrong_password_returns_401(client):
    response = _login(client, "wrong", "198.51.100.11")
    assert response.status_code == 401


def test_repeated_failures_lock_the_account_with_429(client):
    ip = "198.51.100.12"
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS - 1):
        assert _login(client, "wrong", ip).status_code == 401

    locked = _login(client, "wrong", ip)
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers

    # 잠긴 뒤에는 올바른 비밀번호도 거부한다
    assert _login(client, _PASSWORD, ip).status_code == 429
