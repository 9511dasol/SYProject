"""0006_seed_media_budgets — 매체별 예산 기본값 심기.

0005 로 예산 칸을 DB로 옮겼지만 값이 없으면 엑셀의 예산소진율은 빈칸, 잔여광고비는
음수로 나온다. 그래서 지금까지 템플릿에 상수로 박혀 있던 값을 한 번 넣어 준다.

이 마이그레이션은 운영 DB의 데이터를 건드리므로, 이미 손으로 넣은 값을 덮지 않는지와
여러 번 돌려도 안전한지를 검증한다. migrations/env.py 는 psycopg2 전용 connect_args 를
박아 두어 SQLite 로 탈 수 없으므로, 리비전 함수만 직접 호출한다.
"""

import importlib.util
from datetime import date
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations" / "versions" / "20260729_0100_0006_seed_media_budgets.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("seed_media_budgets", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


seed = _load_migration()


@pytest.fixture
def db():
    """0005 까지 적용된 상태의 최소 스키마."""
    engine = sa.create_engine("sqlite://")
    meta = sa.MetaData()
    data = sa.Table(
        "marketing_data", meta,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("report_date", sa.Date),
        sa.Column("campaign_type", sa.String),
    )
    period_meta = sa.Table(
        "marketing_period_meta", meta,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("year", sa.Integer),
        sa.Column("month", sa.Integer),
        sa.Column("comment", sa.String),
        sa.Column("media_budgets", sa.JSON),
    )
    meta.create_all(engine)
    try:
        yield engine, data, period_meta
    finally:
        engine.dispose()


def _add_data(db, *days: date) -> None:
    engine, data, _ = db
    with engine.begin() as conn:
        for day in days:
            conn.execute(data.insert().values(report_date=day, campaign_type="네이버SA"))


def _add_meta(db, **values) -> None:
    engine, _, period_meta = db
    with engine.begin() as conn:
        conn.execute(period_meta.insert().values(**values))


def _upgrade(db) -> None:
    engine, _, _ = db
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            seed.upgrade()


def _rows(db) -> list[dict]:
    engine, _, period_meta = db
    with engine.begin() as conn:
        return [dict(r._mapping) for r in conn.execute(sa.select(period_meta))]


def test_seeds_the_earliest_period(db):
    """예산은 뒤 기간이 이어받으므로 가장 오래된 기간 한 곳만 채우면 전 기간이 덮인다."""
    _add_data(db, date(2026, 6, 3), date(2026, 4, 11), date(2026, 5, 1))

    _upgrade(db)

    row = _rows(db)[0]
    assert (row["year"], row["month"]) == (2026, 4)
    assert row["media_budgets"] == seed.SEED_BUDGETS


def test_existing_comment_row_is_updated_not_duplicated(db):
    _add_data(db, date(2026, 4, 11))
    _add_meta(db, year=2026, month=4, comment="CPC 상승")

    _upgrade(db)

    rows = _rows(db)
    assert len(rows) == 1
    assert rows[0]["comment"] == "CPC 상승"
    assert rows[0]["media_budgets"] == seed.SEED_BUDGETS


def test_manually_entered_budgets_are_never_overwritten(db):
    """관리자가 먼저 입력한 값을 시드가 되돌리면 안 된다."""
    _add_data(db, date(2026, 4, 11))
    _add_meta(db, year=2026, month=5, comment="", media_budgets={"구글SA": 1})

    _upgrade(db)

    assert _rows(db) == [
        {"id": 1, "year": 2026, "month": 5, "comment": "", "media_budgets": {"구글SA": 1}}
    ]


def test_no_data_means_nothing_to_seed(db):
    _upgrade(db)
    assert _rows(db) == []


def test_running_twice_changes_nothing(db):
    _add_data(db, date(2026, 4, 11))

    _upgrade(db)
    once = _rows(db)
    _upgrade(db)

    assert _rows(db) == once


def test_downgrade_keeps_the_values(db):
    """심은 뒤 관리자가 고쳤을 수 있어 되돌리지 않는다 — 컬럼째 없애려면 0005 까지 내린다."""
    engine, _, _ = db
    _add_data(db, date(2026, 4, 11))
    _upgrade(db)

    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            seed.downgrade()

    assert _rows(db)[0]["media_budgets"] == seed.SEED_BUDGETS


def test_seed_covers_every_media_the_excel_has_a_row_for(db):
    """엑셀에 예산 칸이 있는 매체가 시드에서 빠지면 그 매체만 0으로 남는다."""
    from app.services.excel_service import SUMMARY_BUDGET_ROWS

    assert set(seed.SEED_BUDGETS) == set(SUMMARY_BUDGET_ROWS)
