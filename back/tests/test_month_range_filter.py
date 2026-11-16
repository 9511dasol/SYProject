"""월별 조회 조건이 인덱스를 타는 범위 조건으로 바뀌어도 뜻이 같아야 한다.

`extract('year', report_date) == y AND extract('month', ...) == m` 는 컬럼에 함수를
씌워 report_date 인덱스를 못 탔다. 같은 뜻의 `start <= report_date < next_month` 로
바꿨는데, 경계(월 첫날·말일·12월→다음 해)를 잘못 잡으면 데이터가 조용히 누락되거나
옆 달이 섞인다. 그 경계를 고정한다.
"""

import datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.marketing_model import MarketingData, in_month, month_bounds


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    MarketingData.__table__.create(engine)
    db = sessionmaker(bind=engine)()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def _add(db, *dates: str) -> None:
    for d in dates:
        db.add(MarketingData(
            report_date=datetime.date.fromisoformat(d), campaign_type="구글SA",
        ))
    db.commit()


def _dates_in(db, year: int, month: int) -> list[str]:
    rows = db.scalars(select(MarketingData.report_date).where(in_month(year, month))).all()
    return sorted(str(r) for r in rows)


# ── 경계 ─────────────────────────────────────────────────────────────────────


def test_month_bounds_rolls_over_to_the_next_year_in_december():
    """12월의 끝 경계는 이듬해 1월 1일이다 — 13월을 만들면 ValueError 로 깨진다."""
    assert month_bounds(2026, 12) == (datetime.date(2026, 12, 1), datetime.date(2027, 1, 1))


def test_month_bounds_for_a_normal_month():
    assert month_bounds(2026, 7) == (datetime.date(2026, 7, 1), datetime.date(2026, 8, 1))


def test_first_and_last_day_are_included(session):
    """월 첫날과 말일이 모두 포함돼야 한다 — 끝 경계가 '미만'이라 말일이 빠지기 쉽다."""
    _add(session, "2026-07-01", "2026-07-15", "2026-07-31")
    assert _dates_in(session, 2026, 7) == ["2026-07-01", "2026-07-15", "2026-07-31"]


def test_adjacent_months_are_excluded(session):
    _add(session, "2026-06-30", "2026-07-01", "2026-07-31", "2026-08-01")
    assert _dates_in(session, 2026, 7) == ["2026-07-01", "2026-07-31"]


def test_december_includes_its_last_day_and_excludes_january(session):
    _add(session, "2026-11-30", "2026-12-01", "2026-12-31", "2027-01-01")
    assert _dates_in(session, 2026, 12) == ["2026-12-01", "2026-12-31"]


def test_january_excludes_the_previous_december(session):
    _add(session, "2025-12-31", "2026-01-01", "2026-01-31", "2026-02-01")
    assert _dates_in(session, 2026, 1) == ["2026-01-01", "2026-01-31"]


def test_february_in_a_leap_year_includes_the_29th(session):
    _add(session, "2028-02-28", "2028-02-29", "2028-03-01")
    assert _dates_in(session, 2028, 2) == ["2028-02-28", "2028-02-29"]


def test_empty_month_returns_nothing(session):
    _add(session, "2026-07-01")
    assert _dates_in(session, 2026, 8) == []
