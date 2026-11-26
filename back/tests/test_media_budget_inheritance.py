"""예산은 입력하지 않은 달에도 이전 달 값을 이어받아야 한다.

예산은 계약이 바뀌지 않는 한 매달 같은 값이라, 매달 다시 입력하게 하면 건너뛴 달의
예산소진율·잔여광고비가 통째로 0이 된다. 그래서 get_media_budgets 는 "그 달에 없으면
그 이전에 입력된 가장 최근 값"을 쓴다.

조회를 SQL 로 내리면서 "값이 있는 행" 판정을 IS NOT NULL 로만 하면 이 상속이 깨진다 —
예산을 비운 달은 컬럼에 파이썬 None 이 들어가는데, JSON 타입은 그걸 SQL NULL 이 아니라
JSON null 로 저장할 수 있어 "값이 있는 행"으로 뽑히기 때문이다. 그 경계를 고정한다.
"""

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from app.models.marketing_model import MarketingPeriodMeta
from app.repositories.marketing_repo import MarketingRepository

NAVER = {"네이버SA": 19_000_000.0}
KAKAO = {"카카오SA": 50_000.0}


@pytest.fixture
def db():
    engine = sa.create_engine("sqlite://")
    MarketingPeriodMeta.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _set(db, year: int, month: int, budgets: dict) -> None:
    MarketingRepository(db, 1).set_media_budgets(year, month, budgets)
    db.commit()


def _get(db, year: int, month: int):
    return MarketingRepository(db, 1).get_media_budgets(year, month)


# ── 기본 상속 ────────────────────────────────────────────────────────────────


def test_same_month_value_is_used(db):
    _set(db, 2026, 10, NAVER)
    assert _get(db, 2026, 10) == (NAVER, (2026, 10))


def test_later_month_inherits_the_most_recent_value(db):
    _set(db, 2026, 10, NAVER)
    assert _get(db, 2026, 12) == (NAVER, (2026, 10))


def test_the_nearest_earlier_month_wins(db):
    _set(db, 2026, 8, NAVER)
    _set(db, 2026, 10, KAKAO)
    assert _get(db, 2026, 11) == (KAKAO, (2026, 10))


def test_future_months_are_not_inherited_backwards(db):
    """아직 오지 않은 달에 넣어 둔 값이 과거로 새어 들어오면 안 된다."""
    _set(db, 2026, 12, NAVER)
    assert _get(db, 2026, 10) == ({}, None)


def test_no_budget_anywhere_returns_empty(db):
    assert _get(db, 2026, 10) == ({}, None)


# ── 비운 달 (회귀 지점) ──────────────────────────────────────────────────────


def test_clearing_one_month_does_not_break_later_months(db):
    """가장 중요한 지점 — 11월을 비웠다고 12월까지 0이 되면 안 된다."""
    _set(db, 2026, 10, NAVER)
    _set(db, 2026, 11, {})          # 관리자가 11월 설정을 지움

    assert _get(db, 2026, 11) == (NAVER, (2026, 10))
    assert _get(db, 2026, 12) == (NAVER, (2026, 10))


def test_clearing_is_not_mistaken_for_a_value(db):
    """비운 달만 있으면 상속할 값이 없다 — 빈 결과여야 한다."""
    _set(db, 2026, 10, {})
    assert _get(db, 2026, 11) == ({}, None)


def test_a_row_with_only_a_comment_is_skipped(db):
    """코멘트만 저장된 달(예산 미입력)도 건너뛰고 이전 값을 이어받아야 한다."""
    _set(db, 2026, 10, NAVER)
    db.add(MarketingPeriodMeta(company_id=1, year=2026, month=11, comment="11월 코멘트"))
    db.commit()

    assert _get(db, 2026, 12) == (NAVER, (2026, 10))


def test_all_zero_budgets_are_skipped_as_unset(db):
    """값이 전부 None 이라 걸러지고 나면 빈 dict 다 — 그 달은 없는 셈 쳐야 한다."""
    _set(db, 2026, 10, NAVER)
    MarketingRepository(db, 1).set_media_budgets(2026, 11, {})
    db.commit()

    budgets, source = _get(db, 2026, 12)
    assert budgets == NAVER and source == (2026, 10)


# ── 연도 경계 ────────────────────────────────────────────────────────────────


def test_inheritance_crosses_the_year_boundary(db):
    _set(db, 2025, 12, NAVER)
    assert _get(db, 2026, 1) == (NAVER, (2025, 12))
