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


class TestValueCleaning:
    """시크릿 값에 섞여 들어오는 BOM·공백 제거.

    Secret Manager에 UTF-8 BOM으로 저장하면 값 맨 앞에 U+FEFF가 붙는다. 그 값이
    Authorization 헤더로 들어가는 순간 한참 뒤에서 터진다 — 실제로 Supabase Storage
    업로드가 "'ascii' codec can't encode character '\ufeff' in position 7"로 실패했다.
    ("Bearer "가 7글자라 키의 첫 글자가 position 7이다.)
    로컬 .env에는 BOM이 없어 운영에서만 재현되고, 메시지에 원인이 드러나지 않는다.
    """

    def test_bom_is_stripped_from_secret(self):
        assert _settings(SUPABASE_SERVICE_ROLE_KEY="\ufeffeyJhbGciOi").SUPABASE_SERVICE_ROLE_KEY == "eyJhbGciOi"

    def test_surrounding_whitespace_is_stripped(self):
        # 콘솔에서 붙여넣다 개행이 딸려 들어가는 경우 — 호스트명 해석부터 깨진다
        assert _settings(SUPABASE_URL="  https://x.supabase.co\n").SUPABASE_URL == "https://x.supabase.co"

    def test_cleaned_key_builds_a_valid_authorization_header(self):
        """이 조합이 실제로 터졌던 지점 — 헤더까지 만들어봐야 회귀를 잡는다."""
        import httpx

        key = _settings(SUPABASE_SERVICE_ROLE_KEY="\ufeffeyJhbGciOi").SUPABASE_SERVICE_ROLE_KEY
        headers = httpx.Headers({"Authorization": f"Bearer {key}"})

        assert headers["Authorization"] == "Bearer eyJhbGciOi"

    def test_non_string_values_are_left_alone(self):
        settings = _settings(SMTP_PORT=587, MAIL_ENABLED=False)
        assert settings.SMTP_PORT == 587
        assert settings.MAIL_ENABLED is False
