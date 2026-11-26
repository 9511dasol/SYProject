"""순위 모니터링 마이그레이션(0009 → 0010)이 모델과 같은 스키마를 만드는지.

마이그레이션은 로컬에서 거의 돌려보지 않는다 — 개발 DB 는 create_all 로 만들어지고,
운영에서만 실제로 적용된다. 그래서 "모델에 컬럼을 추가하고 마이그레이션에는 빠뜨리는"
실수가 배포 때까지 드러나지 않는다. 두 경로가 같은 결과를 내는지 여기서 고정한다.

alembic 의 op 프록시를 직접 띄워 upgrade() 를 SQLite 에 적용한다. SQLite 는 Postgres 와
타입 체계가 다르지만 컬럼 **구성**이 어긋나는지는 똑같이 드러난다.
"""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.models.company_model import Company
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.models.user_model import User

_VERSIONS = Path(__file__).resolve().parents[1] / "migrations" / "versions"
_M0009 = "20261118_0000_0009_keyword_rank_monitor.py"
_M0010 = "20261118_0100_0010_rank_alerts.py"
_M0011 = "20261122_0000_0011_rank_api_collect.py"
# 멀티테넌시(0012~0014)가 순위 테이블에도 company_id 를 더하므로 체인에 포함한다.
_M0012 = "20261125_0000_0012_companies_roles.py"
_M0013 = "20261125_0100_0013_tenant_columns.py"
_M0014 = "20261125_0200_0014_audit_budget.py"


def _load(filename: str):
    """숫자로 시작하는 파일명이라 일반 import 로는 못 불러온다."""
    path = _VERSIONS / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    # 마이그레이션은 users 가 이미 있다고 가정한다 (0001 baseline 소관).
    # users.company_id 의 FK 가 companies 를 참조하므로 companies 를 먼저 만든다.
    Company.__table__.create(eng)
    User.__table__.create(eng)
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


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(engine).get_columns(table)}


def _model_columns(model) -> set[str]:
    return {c.name for c in model.__table__.columns}


def test_migrations_create_schema_matching_models(engine):
    _run_upgrades(engine, _M0009, _M0010, _M0011, _M0012, _M0013, _M0014)

    for model, table in (
        (KeywordWatch, "keyword_watch"),
        (KeywordRankSnapshot, "keyword_rank_snapshot"),
        (RankAlertLog, "rank_alert_log"),
    ):
        assert _columns(engine, table) == _model_columns(model), (
            f"{table} 의 마이그레이션 컬럼이 모델과 다릅니다"
        )


def test_0010_adds_alert_columns_to_existing_table(engine):
    """0009 만 적용된 기존 DB(알림 컬럼 없음)에 0010 이 컬럼을 채워 넣는다."""
    _run_upgrades(engine, _M0009)
    before = _columns(engine, "keyword_watch")
    assert "cooldown_hours" not in before      # 0009 시점에는 없던 컬럼
    assert "rank_alert_log" not in sa.inspect(engine).get_table_names()

    _run_upgrades(engine, _M0010)
    after = _columns(engine, "keyword_watch")
    assert {"cooldown_hours", "alerted", "last_alerted_at"} <= after
    assert "rank_alert_log" in sa.inspect(engine).get_table_names()


def test_upgrades_are_idempotent(engine):
    """create_all 로 이미 만들어진 DB 에 적용해도 터지지 않는다 (신규 DB 경로)."""
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    RankAlertLog.__table__.create(engine)

    _run_upgrades(engine, _M0009, _M0010, _M0011, _M0012, _M0013, _M0014)   # 전부 건너뛰어야 한다
    _run_upgrades(engine, _M0009, _M0010, _M0011, _M0012, _M0013, _M0014)   # 두 번 돌려도 마찬가지

    assert _columns(engine, "keyword_watch") == _model_columns(KeywordWatch)


def test_0011_adds_api_collect_columns_to_existing_table(engine):
    """0010 까지 적용된 기존 DB 에 API 수집용 컬럼이 더해진다."""
    _run_upgrades(engine, _M0009, _M0010)
    before = _columns(engine, "keyword_watch")
    assert "nv_keyword_ids" not in before

    _run_upgrades(engine, _M0011)
    after = _columns(engine, "keyword_watch")
    assert {"nv_keyword_ids", "nv_synced_at", "last_error_code", "last_error_at"} <= after


def test_new_rows_get_defaults_for_alert_columns(engine):
    """기존 행에도 값이 있어야 한다 — server_default 가 없으면 NULL 로 남아 판정이 깨진다."""
    _run_upgrades(engine, _M0009)
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO keyword_watch "
            "(keyword, device, target_rank, tolerance, breaches_required, "
            " alert_on_no_impression, status, breach_streak, created_at) "
            "VALUES ('기존키워드', 'all', 3.0, 0.5, 2, 1, 'active', 0, CURRENT_TIMESTAMP)"
        ))

    _run_upgrades(engine, _M0010)
    with engine.begin() as conn:
        row = conn.execute(sa.text(
            "SELECT cooldown_hours, alerted FROM keyword_watch WHERE keyword = '기존키워드'"
        )).one()
    assert row[0] == 24          # 모델 기본값과 같은 값
    assert row[1] in (0, False)  # SQLite 는 불리언을 0/1 로 돌려준다
