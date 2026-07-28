"""계정 단위 로그인 잠금.

IP 기반 rate limit은 X-Forwarded-For를 바꾸면 우회할 수 있으므로, 무차별 대입의
실질적인 방어선은 계정 단위 실패 카운터다.

users 테이블은 Postgres 전용 타입을 쓰지 않으므로 SQLite 인메모리로 검증할 수 있다.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.settings import settings
from app.models.user_model import User
from app.repositories.user_repo import AccountLockedError, UserRepository

_PASSWORD = "correct-horse-battery"


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def repo(db):
    repo = UserRepository(db)
    repo.create_user(email="user@example.com", password=_PASSWORD)
    return repo


def _fail_once(repo: UserRepository) -> None:
    assert repo.authenticate("user@example.com", "wrong") is None


def test_correct_password_returns_user(repo):
    user = repo.authenticate("user@example.com", _PASSWORD)
    assert user is not None and user.email == "user@example.com"


def test_unknown_email_returns_none(repo):
    assert repo.authenticate("nobody@example.com", _PASSWORD) is None


def test_failed_attempts_accumulate(repo):
    _fail_once(repo)
    _fail_once(repo)
    assert repo.get_by_email("user@example.com").failed_login_attempts == 2


def test_success_resets_counter(repo):
    _fail_once(repo)
    repo.authenticate("user@example.com", _PASSWORD)
    assert repo.get_by_email("user@example.com").failed_login_attempts == 0


def test_lockout_after_max_attempts(repo):
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS - 1):
        _fail_once(repo)

    # 임계값에 닿는 시도에서 잠금이 걸린다
    with pytest.raises(AccountLockedError):
        repo.authenticate("user@example.com", "wrong")

    assert repo.get_by_email("user@example.com").locked_until is not None


def test_locked_account_rejects_even_correct_password(repo):
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS - 1):
        _fail_once(repo)
    with pytest.raises(AccountLockedError):
        repo.authenticate("user@example.com", "wrong")

    with pytest.raises(AccountLockedError) as exc_info:
        repo.authenticate("user@example.com", _PASSWORD)
    assert exc_info.value.retry_after_seconds > 0


def test_expired_lock_allows_login_again(repo, db):
    user = repo.get_by_email("user@example.com")
    user.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    assert repo.authenticate("user@example.com", _PASSWORD) is not None
    assert repo.get_by_email("user@example.com").locked_until is None
