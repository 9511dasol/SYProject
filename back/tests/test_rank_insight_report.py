"""경쟁 지표와 리포트 결합(M6) — 파싱 규칙과 '리포트는 나가야 한다'는 약속을 고정한다.

네트워크는 쓰지 않는다. 실제 API 로 확인한 응답 모양(검색량이 적으면 숫자가 아니라
"< 10" 문자열로 온다)을 가짜 클라이언트로 재현한다.
"""

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.models.user_model import User
from app.services.rank.base import RankProviderError
from app.services.rank.bid_estimate import BidEstimate, BidRow
from app.services.rank.keyword_insight import KeywordInsightService
from app.services.rank.naver_client import ERR_QUOTA
from app.core.settings import settings
from app.services.rank.report_section import build_rank_section

MAX_ROWS = settings.RANK_REPORT_MAX_ROWS

TARGET = date(2026, 11, 21)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    RankAlertLog.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _watch(db, keyword="마케팅자동화", **kwargs):
    defaults = dict(
        keyword=keyword, device="all", target_rank=2.0, tolerance=0.5,
        breaches_required=1, cooldown_hours=24, alert_on_no_impression=True,
        status="active", breach_streak=0,
    )
    defaults.update(kwargs)
    watch = KeywordWatch(company_id=1, **defaults)
    db.add(watch)
    db.commit()
    return watch


def _snap(db, watch, avg_rank, stat_date=TARGET):
    db.add(KeywordRankSnapshot(company_id=1, 
        watch_id=watch.id, stat_date=stat_date, avg_rank=avg_rank,
        impressions=10, clicks=1, source="api",
    ))
    db.commit()


# ── 경쟁 지표 파싱 ────────────────────────────────────────────────────────────


class FakeToolClient:
    is_configured = True

    def __init__(self, rows=None, fail=None):
        self._rows = rows if rows is not None else []
        self._fail = fail

    def keyword_tool(self, hint_keyword):
        if self._fail:
            raise self._fail
        return self._rows


def test_parses_real_response_shape():
    rows = [{
        "relKeyword": "수학과편입", "monthlyPcQcCnt": 150, "monthlyMobileQcCnt": 20,
        "plAvgDepth": 7, "compIdx": "중간",
        "monthlyAvePcCtr": 0.0, "monthlyAveMobileCtr": 1.91,
    }]
    insight = KeywordInsightService(client=FakeToolClient(rows)).fetch("수학과편입")

    assert insight.monthly_pc == 150 and insight.monthly_mobile == 20
    assert insight.monthly_total == 170
    assert insight.competition == "중간"
    assert insight.ad_depth == 7          # 평균 7개 광고가 붙는다 = 경쟁 밀도
    assert insight.ctr_mobile == 1.91


def test_low_volume_string_is_not_treated_as_a_number():
    """검색량이 적으면 매체가 '< 10' 문자열을 준다 — int() 하면 터진다."""
    rows = [{"relKeyword": "수학과편입", "monthlyPcQcCnt": "< 10",
             "monthlyMobileQcCnt": 20, "plAvgDepth": 7, "compIdx": "낮음"}]
    insight = KeywordInsightService(client=FakeToolClient(rows)).fetch("수학과편입")

    assert insight.monthly_pc is None and insight.pc_low_volume is True
    assert insight.monthly_mobile == 20 and insight.mobile_low_volume is False
    assert insight.monthly_total is None   # 한쪽을 모르면 합계를 말할 수 없다


def test_picks_requested_keyword_from_related_list():
    """키워드 도구는 연관 키워드를 함께 준다 — 요청한 것만 골라야 한다."""
    rows = [
        {"relKeyword": "편입수학", "monthlyPcQcCnt": 900, "plAvgDepth": 9},
        {"relKeyword": "수학과 편입", "monthlyPcQcCnt": 150, "plAvgDepth": 7},
    ]
    insight = KeywordInsightService(client=FakeToolClient(rows)).fetch("수학과편입")

    assert insight.monthly_pc == 150       # 띄어쓰기 차이는 같은 키워드로 본다


def test_unknown_keyword_returns_none():
    rows = [{"relKeyword": "전혀다른키워드", "monthlyPcQcCnt": 10}]
    assert KeywordInsightService(client=FakeToolClient(rows)).fetch("마케팅자동화") is None


def test_api_failure_propagates():
    client = FakeToolClient(fail=RankProviderError(ERR_QUOTA, "한도 초과"))
    with pytest.raises(RankProviderError):
        KeywordInsightService(client=client).fetch("마케팅자동화")


# ── 리포트 결합 ───────────────────────────────────────────────────────────────


class FakeEstimator:
    def __init__(self, bid=1500, fail=None, configured=True):
        self.is_configured = configured
        self.calls: list[str] = []
        self._bid = bid
        self._fail = fail

    def estimate(self, keyword, device="all", max_position=5):
        if self._fail:
            raise self._fail
        self.calls.append(keyword)
        return BidEstimate(
            keyword=keyword,
            rows=[BidRow(position=p, pc=self._bid, mobile=self._bid + 500)
                  for p in range(1, max_position + 1)],
        )


def test_section_lists_only_breached_keywords(db):
    ok = _watch(db, "정상키워드", breach_streak=0)
    bad = _watch(db, "하락키워드", breach_streak=2)
    _snap(db, ok, 1.0)
    _snap(db, bad, 8.0)

    section = build_rank_section(db, estimator=FakeEstimator())

    assert section.total_watched == 2
    assert section.breached_total == 1
    assert [r.keyword for r in section.rows] == ["하락키워드"]
    assert section.rows[0].current_rank == 8.0


def test_section_attaches_target_bid(db):
    watch = _watch(db, "하락키워드", breach_streak=1, target_rank=3.0)
    _snap(db, watch, 9.0)

    section = build_rank_section(db, estimator=FakeEstimator(bid=1700))

    row = section.rows[0]
    assert row.target_bid_pc == 1700 and row.target_bid_mobile == 2200


def test_longest_breach_comes_first(db):
    for name, streak in (("짧은이탈", 1), ("긴이탈", 9), ("중간이탈", 4)):
        w = _watch(db, name, breach_streak=streak)
        _snap(db, w, 9.0)

    section = build_rank_section(db, estimator=FakeEstimator())
    assert [r.keyword for r in section.rows] == ["긴이탈", "중간이탈", "짧은이탈"]


def test_overflow_is_reported_not_silently_dropped(db):
    for i in range(MAX_ROWS + 3):
        w = _watch(db, f"키워드{i:02d}", breach_streak=1)
        _snap(db, w, 9.0)

    section = build_rank_section(db, estimator=FakeEstimator())

    assert len(section.rows) == MAX_ROWS
    assert section.omitted == 3        # "외 3건"으로 알린다
    assert section.breached_total == MAX_ROWS + 3


def test_estimate_failure_leaves_bid_blank_but_keeps_row(db):
    """입찰가를 못 받았다고 그 키워드를 리포트에서 빼면 안 된다."""
    watch = _watch(db, "하락키워드", breach_streak=1)
    _snap(db, watch, 9.0)

    failing = FakeEstimator(fail=RankProviderError(ERR_QUOTA, "한도 초과"))
    section = build_rank_section(db, estimator=failing)

    assert len(section.rows) == 1
    assert section.rows[0].target_bid_pc is None


def test_unconfigured_estimator_skips_api_entirely(db):
    watch = _watch(db, "하락키워드", breach_streak=1)
    _snap(db, watch, 9.0)

    estimator = FakeEstimator(configured=False)
    section = build_rank_section(db, estimator=estimator)

    assert estimator.calls == []       # API 키가 없으면 부르지도 않는다
    assert len(section.rows) == 1


def test_all_healthy_still_renders_a_section(db):
    """'모두 정상'도 알려 줄 가치가 있다 — 구역이 통째로 사라지면 감시가 도는지 모른다."""
    watch = _watch(db, "정상키워드", breach_streak=0)
    _snap(db, watch, 1.0)

    section = build_rank_section(db, estimator=FakeEstimator())
    assert section.has_content is True and section.rows == []


def test_no_watches_means_no_section(db):
    section = build_rank_section(db, estimator=FakeEstimator())
    assert section.has_content is False


def test_paused_watches_are_excluded(db):
    watch = _watch(db, "정지키워드", breach_streak=5, status="paused")
    _snap(db, watch, 9.0)

    section = build_rank_section(db, estimator=FakeEstimator())
    assert section.total_watched == 0 and section.rows == []
