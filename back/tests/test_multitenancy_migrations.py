"""멀티테넌시 마이그레이션(0012 → 0014)이 구 스키마 DB 를 올바르게 전환하는지.

운영 DB 는 "company 개념이 없던" 단일 테넌트 스키마다. 그 상태를 원시 SQL 로
재현해 두고 업그레이드를 적용해, 다음 약속을 고정한다:

- 첫 기업 sy 가 id=1 로 시드된다 (과도기 server_default="1" 의 전제).
- 기존 계정·데이터 전부가 sy(company_id=1) 소속이 된다.
- 구 역할값 user 는 member 가 되고, 중복 admin 은 최선임 1명만 남는다.
- "기업당 admin 1개"는 DB(partial unique index)가 강제한다.
- 유니크 제약이 기업 범위로 바뀌어, 다른 기업은 같은 연월·같은 키워드를 쓸 수 있다.
- 전역 싱글턴 AI 예산(id=1)은 sy 의 기업별 예산이 된다.
"""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool

_VERSIONS = Path(__file__).resolve().parents[1] / "migrations" / "versions"
_M0012 = "20261125_0000_0012_companies_roles.py"
_M0013 = "20261125_0100_0013_tenant_columns.py"
_M0014 = "20261125_0200_0014_audit_budget.py"
_M0015 = "20261125_0300_0015_drop_company_default.py"

# 0011 까지 적용된 운영 DB 의 모습 (관련 테이블만, company 개념 없음).
_LEGACY_SCHEMA = """
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    hashed_password VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    failed_login_attempts INTEGER DEFAULT '0' NOT NULL,
    locked_until DATETIME
);
CREATE TABLE marketing_period_meta (
    id INTEGER NOT NULL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    comment VARCHAR NOT NULL,
    comment_updated_at DATETIME,
    comment_prompt_hash VARCHAR(64),
    excel_path VARCHAR,
    media_budgets JSON,
    CONSTRAINT uq_period_year_month UNIQUE (year, month)
);
CREATE TABLE marketing_data (
    id INTEGER NOT NULL PRIMARY KEY,
    report_date DATE NOT NULL,
    campaign_type VARCHAR NOT NULL,
    impressions INTEGER NOT NULL,
    clicks INTEGER NOT NULL,
    cost FLOAT NOT NULL,
    conversions INTEGER NOT NULL,
    conversion_revenue FLOAT NOT NULL,
    signup FLOAT NOT NULL,
    purchase FLOAT NOT NULL,
    apply FLOAT NOT NULL
);
CREATE TABLE keyword_watch (
    id INTEGER NOT NULL PRIMARY KEY,
    keyword VARCHAR(100) NOT NULL,
    device VARCHAR(10) NOT NULL,
    target_rank FLOAT NOT NULL,
    tolerance FLOAT NOT NULL,
    breaches_required INTEGER NOT NULL,
    alert_on_no_impression BOOLEAN NOT NULL,
    color_tag VARCHAR(10),
    cooldown_hours INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    breach_streak INTEGER NOT NULL,
    alerted BOOLEAN NOT NULL,
    last_alerted_at DATETIME,
    last_checked_at DATETIME,
    nv_keyword_ids JSON,
    nv_synced_at DATETIME,
    last_error_code VARCHAR(30),
    last_error_at DATETIME,
    created_by INTEGER REFERENCES users (id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_watch_keyword_device UNIQUE (keyword, device)
);
CREATE TABLE ai_usage_budget (
    id INTEGER NOT NULL PRIMARY KEY,
    monthly_token_budget INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
"""


def _load(filename: str):
    path = _VERSIONS / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def engine():
    eng = sa.create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with eng.begin() as conn:
        for stmt in _LEGACY_SCHEMA.split(";"):
            if stmt.strip():
                conn.execute(sa.text(stmt))
    try:
        yield eng
    finally:
        eng.dispose()


def _run_upgrades(engine, *filenames: str) -> None:
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            for name in filenames:
                _load(name).upgrade()


def _seed_legacy_users(engine) -> None:
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO users (id, email, name, hashed_password, role, is_active) VALUES "
            "(1, 'first-admin@a.com', '', 'x', 'admin', 1), "
            "(2, 'second-admin@a.com', '', 'x', 'admin', 1), "
            "(3, 'member@a.com', '', 'x', 'user', 1)"
        ))


def test_0012_seeds_sy_and_converts_roles(engine):
    _seed_legacy_users(engine)
    _run_upgrades(engine, _M0012)

    with engine.begin() as conn:
        sy = conn.execute(sa.text("SELECT id, name, is_trial FROM companies")).one()
        assert (sy[0], sy[1]) == (1, "sy")
        assert sy[2] in (0, False)

        rows = conn.execute(
            sa.text("SELECT id, role, company_id FROM users ORDER BY id")
        ).all()
    # 전원 sy 소속, user → member, 중복 admin 은 id 최소(1번)만 admin 유지.
    assert rows == [(1, "admin", 1), (2, "member", 1), (3, "member", 1)]


def test_0012_db_enforces_one_admin_per_company(engine):
    _seed_legacy_users(engine)
    _run_upgrades(engine, _M0012)

    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(sa.text(
                "INSERT INTO users (email, name, hashed_password, role, is_active, company_id) "
                "VALUES ('another-admin@a.com', '', 'x', 'admin', 1, 1)"
            ))

    # member 는 같은 기업에 얼마든지 — partial 이라 admin 행만 제약에 걸린다.
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO users (email, name, hashed_password, role, is_active, company_id) "
            "VALUES ('member2@a.com', '', 'x', 'member', 1, 1)"
        ))


def test_0013_backfills_sy_and_rescopes_uniques(engine):
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO marketing_period_meta (year, month, comment) VALUES (2026, 11, '')"
        ))
        conn.execute(sa.text(
            "INSERT INTO keyword_watch (keyword, device, target_rank, tolerance,"
            " breaches_required, alert_on_no_impression, cooldown_hours, status,"
            " breach_streak, alerted) "
            "VALUES ('키워드', 'all', 3.0, 0.5, 2, 1, 24, 'active', 0, 0)"
        ))
    _run_upgrades(engine, _M0012, _M0013)

    with engine.begin() as conn:
        # 기존 데이터는 sy 귀속
        assert conn.execute(
            sa.text("SELECT company_id FROM marketing_period_meta")
        ).scalar() == 1
        assert conn.execute(
            sa.text("SELECT company_id FROM keyword_watch")
        ).scalar() == 1

        # 다른 기업은 같은 연월·같은 키워드를 쓸 수 있다 (기업 범위 유니크)
        conn.execute(sa.text(
            "INSERT INTO companies (id, name, is_active, is_trial) VALUES (2, 'b', 1, 0)"
        ))
        conn.execute(sa.text(
            "INSERT INTO marketing_period_meta (company_id, year, month, comment) "
            "VALUES (2, 2026, 11, '')"
        ))
        conn.execute(sa.text(
            "INSERT INTO keyword_watch (company_id, keyword, device, target_rank, tolerance,"
            " breaches_required, alert_on_no_impression, cooldown_hours, status,"
            " breach_streak, alerted) "
            "VALUES (2, '키워드', 'all', 3.0, 0.5, 2, 1, 24, 'active', 0, 0)"
        ))

    # 같은 기업의 같은 연월은 여전히 막힌다
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(sa.text(
                "INSERT INTO marketing_period_meta (company_id, year, month, comment) "
                "VALUES (1, 2026, 11, '')"
            ))


def test_0014_converts_singleton_budget_to_sy(engine):
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO ai_usage_budget (id, monthly_token_budget) VALUES (1, 5000)"
        ))
    _run_upgrades(engine, _M0012, _M0013, _M0014)

    with engine.begin() as conn:
        row = conn.execute(sa.text(
            "SELECT company_id, monthly_token_budget FROM ai_usage_budget"
        )).one()
        assert row == (1, 5000)

        # 기업당 1행 — 같은 기업의 두 번째 예산 행은 DB 가 거부한다
        with pytest.raises(IntegrityError):
            conn.execute(sa.text(
                "INSERT INTO ai_usage_budget (company_id, monthly_token_budget) VALUES (1, 100)"
            ))

        assert "audit_logs" in sa.inspect(engine).get_table_names()


def test_upgrades_are_idempotent_on_legacy_db(engine):
    _seed_legacy_users(engine)
    _run_upgrades(engine, _M0012, _M0013, _M0014, _M0015)
    _run_upgrades(engine, _M0012, _M0013, _M0014, _M0015)  # 두 번 돌려도 터지지 않는다

    with engine.begin() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM companies")).scalar() == 1


def test_0015_is_a_noop_on_sqlite(engine):
    """0015 는 Postgres 전용(ALTER COLUMN)이라 SQLite 에서는 조용히 건너뛴다.

    로컬·테스트 DB 는 모델에서 바로 생성되므로 과도기 기본값이 애초에 없다 —
    이 리비전이 SQLite 에서 터지면 로컬 기동 자체가 막힌다.
    """
    _seed_legacy_users(engine)
    _run_upgrades(engine, _M0012, _M0013, _M0014, _M0015)

    with engine.begin() as conn:
        # 기본값 제거 후에도 명시 INSERT 는 그대로 동작한다
        conn.execute(sa.text(
            "INSERT INTO marketing_period_meta (company_id, year, month, comment) "
            "VALUES (1, 2026, 12, '')"
        ))
        assert conn.execute(
            sa.text("SELECT company_id FROM marketing_period_meta WHERE month = 12")
        ).scalar() == 1
