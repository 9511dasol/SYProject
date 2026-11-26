"""코멘트 비교 기간 — 당월 vs 전월 vs 전년 동월, 없으면 가장 가까운 보유 월.

광고는 계절성이 강해 전월 비교만으로는 판단이 왜곡된다(10월 성수기 등). 그래서
코멘트는 전년 동월과도 비교하는데, 운영 초기에는 작년 데이터가 없을 수 있다.
그때는 가장 가까운 보유 월로 대신하되, **대신했다는 사실을 프롬프트에 밝힌다** —
숫자는 맞는데 "전년 동월"이라는 라벨이 거짓이면 코멘트 전체가 의심받는다.
"""

import datetime

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.marketing_model import MarketingData
from app.services.analysis_service import AnalysisService, MediaKPI, PeriodComparison
from app.services.comment_service import CommentService


@pytest.fixture
def db():
    engine = sa.create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    MarketingData.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _seed(db, year: int, month: int, *, media="네이버SA", cost=1000.0, conv=10, revenue=5000.0):
    db.add(MarketingData(company_id=1, 
        report_date=datetime.date(year, month, 1), campaign_type=media,
        impressions=1000, clicks=100, cost=cost,
        conversions=conv, conversion_revenue=revenue,
        signup=0.0, purchase=0.0, apply=0.0,
    ))
    db.commit()


# ── 기간 결정: 모두 제자리에 있을 때 ────────────────────────────────────────


def test_exact_prev_and_yoy_are_used_when_present(db):
    _seed(db, 2026, 10)
    _seed(db, 2026, 9)
    _seed(db, 2025, 10)

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.prev_year, p.prev_month, p.prev_is_exact) == (2026, 9, True)
    assert (p.yoy_year, p.yoy_month, p.yoy_is_exact) == (2025, 10, True)


def test_january_rolls_back_to_last_december(db):
    _seed(db, 2026, 1)
    _seed(db, 2025, 12)
    _seed(db, 2025, 1)

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 1)

    assert (p.prev_year, p.prev_month, p.prev_is_exact) == (2025, 12, True)
    assert (p.yoy_year, p.yoy_month, p.yoy_is_exact) == (2025, 1, True)


# ── 기간 결정: 전월이 비어 있을 때 ──────────────────────────────────────────


def test_missing_prev_month_falls_back_to_the_nearest_earlier(db):
    """9월이 비었으면 직전 보유 월(8월)과 비교한다 — 빈 비교보다 낫다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 8)   # 9월 없음

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.prev_year, p.prev_month) == (2026, 8)
    assert p.prev_is_exact is False   # 프롬프트가 "전월" 대신 실제 달을 밝힌다


def test_no_earlier_data_keeps_the_calendar_prev(db):
    """첫 달 업로드 — 대신할 달조차 없으면 달력상 전월(빈 비교)을 그대로 쓴다."""
    _seed(db, 2026, 10)

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.prev_year, p.prev_month, p.prev_is_exact) == (2026, 9, True)
    assert p.yoy_year is None   # YoY 후보도 없다


# ── 기간 결정: 전년 동월이 비어 있을 때 ─────────────────────────────────────


def test_missing_yoy_falls_back_to_the_nearest_neighbour(db):
    """2025-10 이 없으면 작년 언저리에서 가장 가까운 달(2025-11)을 쓴다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 9)
    _seed(db, 2025, 11)  # 작년 10월 대신 11월만 있다

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.yoy_year, p.yoy_month) == (2025, 11)
    assert p.yoy_is_exact is False


def test_yoy_tie_prefers_the_older_month(db):
    """2025-09 와 2025-11 이 같은 거리면 더 오래된 쪽 — '작년'의 뜻에 가깝다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 9)
    _seed(db, 2025, 9)
    _seed(db, 2025, 11)

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.yoy_year, p.yoy_month) == (2025, 9)


def test_yoy_never_duplicates_the_prev_month(db):
    """데이터가 두 달뿐이면 같은 달을 전월과 전년 동월로 두 번 쓰지 않는다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 9)   # 이게 전월이자 유일한 과거 달

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.prev_year, p.prev_month) == (2026, 9)
    assert p.yoy_year is None   # 후보가 전월뿐 → YoY 생략


def test_sparse_history_uses_what_exists(db):
    """전월도 작년도 없는 띄엄띄엄한 데이터 — 둘 다 보유 월로 대신한다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 6)
    _seed(db, 2026, 2)

    p = AnalysisService(db, 1).resolve_comment_periods(2026, 10)

    assert (p.prev_year, p.prev_month, p.prev_is_exact) == (2026, 6, False)
    # 작년 10월(목표)과 가장 가까운, 전월보다 오래된 달 = 2026-02
    assert (p.yoy_year, p.yoy_month, p.yoy_is_exact) == (2026, 2, False)


# ── compare 의 YoY 채움 ──────────────────────────────────────────────────────


def test_compare_fills_summary_yoy_figures(db):
    _seed(db, 2026, 10, cost=2000.0, conv=20, revenue=10000.0)
    _seed(db, 2026, 9, cost=1500.0)
    _seed(db, 2025, 10, cost=1000.0, conv=10, revenue=5000.0)

    c = AnalysisService(db, 1).compare(2026, 10, 2026, 9, yoy_year=2025, yoy_month=10)

    assert c.has_yoy is True
    assert (c.yoy_year, c.yoy_month) == (2025, 10)
    assert c.yoy_cost == 1000.0
    assert c.yoy_cost_chg == 100.0     # 1000 → 2000
    assert c.yoy_conv_chg == 100.0
    assert c.yoy_revenue_chg == 100.0
    assert c.yoy_is_exact is True


def test_compare_fills_per_media_yoy(db):
    _seed(db, 2026, 10, media="네이버SA", cost=2000.0)
    _seed(db, 2026, 10, media="구글SA", cost=500.0)      # 작년엔 없던 신규 매체
    _seed(db, 2026, 9, media="네이버SA")
    _seed(db, 2025, 10, media="네이버SA", cost=1000.0)

    c = AnalysisService(db, 1).compare(2026, 10, 2026, 9, yoy_year=2025, yoy_month=10)
    by = {m.campaign_type: m for m in c.by_media}

    assert by["네이버SA"].yoy_missing is False
    assert by["네이버SA"].yoy.cost == 1000.0
    assert by["네이버SA"].yoy_cost_chg == 100.0
    assert by["구글SA"].yoy_missing is True   # 신규 매체 — YoY 비교 불가로 표시


def test_compare_without_yoy_behaves_exactly_as_before(db):
    """리포트 메일 경로는 yoy 를 넘기지 않는다 — 기존과 완전히 같아야 한다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 9)
    _seed(db, 2025, 10)   # 있어도 요청하지 않으면 조회하지 않는다

    c = AnalysisService(db, 1).compare(2026, 10, 2026, 9)

    assert c.has_yoy is False
    assert c.yoy_cost == 0.0


def test_inexact_periods_are_flagged_on_the_comparison(db):
    """대신한 달로 비교하면 플래그가 False — 프롬프트 문구가 여기에 달려 있다."""
    _seed(db, 2026, 10)
    _seed(db, 2026, 8)

    c = AnalysisService(db, 1).compare(2026, 10, 2026, 8, yoy_year=2026, yoy_month=8)

    assert c.prev_is_exact is False
    assert c.yoy_is_exact is False


# ── 프롬프트 렌더링 ──────────────────────────────────────────────────────────


def _prompt(**overrides) -> str:
    base = dict(
        curr_year=2026, curr_month=10,
        prev_year=2026, prev_month=9,
        prev2_year=2026, prev2_month=8,
        by_media=[], curr_cost=2000.0, prev_cost=1500.0,
    )
    base.update(overrides)
    return CommentService(llm=None).build_prompt(PeriodComparison(**base))  # type: ignore[arg-type]


def test_prompt_includes_the_yoy_block_when_available():
    prompt = _prompt(
        has_yoy=True, yoy_year=2025, yoy_month=10,
        yoy_cost=1000.0, yoy_cost_chg=100.0, yoy_is_exact=True,
    )

    assert "전년 동월 대비" in prompt
    assert "2025년 10월" in prompt
    assert "계절성" in prompt                      # 해석 지침까지 포함
    assert "가장 가까운" not in prompt             # 정확한 전년 동월이면 사족 없음


def test_prompt_discloses_a_substituted_yoy_month():
    """대신한 달이면 '전년 동월'이라 말하지 말라는 지시가 프롬프트에 들어간다."""
    prompt = _prompt(
        has_yoy=True, yoy_year=2025, yoy_month=11, yoy_is_exact=False,
    )

    assert "전년 동월 데이터가 없어 가장 가까운 2025년 11월과 비교" in prompt
    assert '"전년 동월"이라 쓰지 말고' in prompt


def test_prompt_discloses_a_substituted_prev_month():
    prompt = _prompt(prev_year=2026, prev_month=8, prev_is_exact=False)

    assert "직전 보유 월인 2026년 8월과 비교" in prompt


def test_prompt_omits_yoy_entirely_when_absent():
    """운영 첫 몇 달 — YoY 가 없으면 블록도 지침도 나오면 안 된다."""
    prompt = _prompt(has_yoy=False)

    assert "전년 동월" not in prompt
    assert "계절성" not in prompt


def test_media_yoy_line_marks_new_media():
    from app.services.analysis_service import MediaComparison

    media = [
        MediaComparison(
            campaign_type="네이버SA",
            curr=MediaKPI("네이버SA", cost=2000.0),
            yoy=MediaKPI("네이버SA", cost=1000.0),
            yoy_cost_chg=100.0,
            yoy_missing=False,
        ),
        MediaComparison(campaign_type="구글SA", yoy_missing=True),
    ]
    prompt = _prompt(has_yoy=True, yoy_year=2025, yoy_month=10, by_media=media)

    assert "2025년 10월 대비: 광고비 1,000원 → 2,000원 (100.0%)" in prompt
    assert "당시 데이터 없음 (신규 매체)" in prompt
