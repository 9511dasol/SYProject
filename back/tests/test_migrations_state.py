"""마이그레이션 기동 정책과 스키마 상태 판정.

운영에서 마이그레이션을 기동 시 적용하면, 실패가 곧 "컨테이너가 포트를 못 엶"이
되어 Cloud Run에는 원인 불명의 전면 장애로 보인다. 실제로 DB에만 있고 코드에는
없는 리비전 때문에 서비스가 통째로 뜨지 못한 적이 있어, 그 상태를 이름 붙여
구분한다(unknown).
"""

from app.core import migrations
from app.core.settings import Settings

_BASE = {
    "_env_file": None,  # back/.env 를 읽지 않고 인자만으로 검증
    "DATABASE_URL": "postgresql+psycopg2://user:pw@db.example.com:5432/postgres",
    "CORS_ORIGINS_RAW": "https://app.example.com",
    "SECRET_KEY": "x" * 32,
}


def _settings(**overrides) -> Settings:
    return Settings(**{**_BASE, **overrides})


# --- 기동 시 자동 적용 여부 ---------------------------------------------------

def test_startup_migrations_off_by_default_in_production():
    assert _settings(ENVIRONMENT="production").RUN_MIGRATIONS_ON_STARTUP is False


def test_startup_migrations_on_by_default_in_development():
    assert _settings(ENVIRONMENT="development").RUN_MIGRATIONS_ON_STARTUP is True


def test_explicit_setting_overrides_environment_default():
    """운영에서도 명시하면 켤 수 있어야 한다 — 기본값일 뿐 강제가 아니다."""
    settings = _settings(ENVIRONMENT="production", RUN_MIGRATIONS_ON_STARTUP=True)
    assert settings.RUN_MIGRATIONS_ON_STARTUP is True


# --- 스키마 상태 판정 ---------------------------------------------------------

def _with_db_revisions(monkeypatch, revisions: set[str]) -> None:
    monkeypatch.setattr(migrations, "_db_revisions", lambda: revisions)


def _code_head() -> str:
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(migrations.alembic_config()).get_current_head()


def test_ok_when_db_matches_code_head(monkeypatch):
    _with_db_revisions(monkeypatch, {_code_head()})
    state, _ = migrations.schema_state()
    assert state == "ok"


def test_pending_when_db_behind_code(monkeypatch):
    _with_db_revisions(monkeypatch, {"0001_baseline"})
    state, detail = migrations.schema_state()
    assert state == "pending"
    assert "scripts/migrate.py" in detail  # 다음 조치를 로그만 보고 알 수 있어야 한다


def test_unknown_when_db_revision_absent_from_scripts(monkeypatch):
    """다른 브랜치가 같은 DB에 마이그레이션을 적용했을 때의 상태."""
    _with_db_revisions(monkeypatch, {"0099_from_another_branch"})
    state, detail = migrations.schema_state()
    assert state == "unknown"
    assert "0099_from_another_branch" in detail


def test_empty_when_database_never_migrated(monkeypatch):
    _with_db_revisions(monkeypatch, set())
    state, _ = migrations.schema_state()
    assert state == "empty"
