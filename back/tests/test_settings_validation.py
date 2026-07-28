"""운영 환경 필수 설정 검증.

예전 구현은 SECRET_KEY가 비어 있어도 그대로 기동해서 빈 문자열로 JWT를 서명했다.
production에서는 반드시 기동에 실패해야 한다.
"""

import pytest
from pydantic import ValidationError

from app.core.settings import Settings

_PROD_BASE = {
    "_env_file": None,  # back/.env 를 읽지 않고 인자만으로 검증
    "ENVIRONMENT": "production",
    "DATABASE_URL": "postgresql+psycopg2://user:pw@db.example.com:5432/postgres",
    "CORS_ORIGINS_RAW": "https://app.example.com",
    "SECRET_KEY": "x" * 32,
}


def _settings(**overrides) -> Settings:
    return Settings(**{**_PROD_BASE, **overrides})


def test_production_requires_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        _settings(SECRET_KEY="")


def test_production_rejects_short_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        _settings(SECRET_KEY="tooshort")


def test_production_rejects_localhost_database_url():
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        _settings(DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/marketing_db")


def test_production_rejects_empty_cors_origins():
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        _settings(CORS_ORIGINS_RAW="  ")


def test_production_accepts_valid_config():
    settings = _settings()
    assert settings.is_production
    assert settings.CORS_ORIGINS == ["https://app.example.com"]


def test_development_generates_ephemeral_secret_key():
    settings = Settings(_env_file=None, ENVIRONMENT="development", SECRET_KEY="")
    assert len(settings.SECRET_KEY) >= 32
    assert not settings.is_production


def test_cors_origins_splits_and_trims():
    settings = Settings(
        _env_file=None,
        CORS_ORIGINS_RAW=" https://a.com , https://b.com ,, ",
        SECRET_KEY="x" * 32,
    )
    assert settings.CORS_ORIGINS == ["https://a.com", "https://b.com"]
