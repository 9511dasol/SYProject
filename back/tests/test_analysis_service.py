"""analysis_service 순수 계산 로직 테스트.

DB 접근(_query_kpis)은 monkeypatch 로 대체해 compare()의 집계·변화율 로직만 검증한다.
"""

import pytest

from app.services import analysis_service
from app.services.analysis_service import (
    AnalysisService,
    MediaKPI,
    _safe_div,
    _safe_pct,
    _trend,
)


class TestSafePct:
    @pytest.mark.parametrize(
        "new, old, expected",
        [
            (150, 100, 50.0),    # 50% 증가
            (50, 100, -50.0),    # 50% 감소
            (100, 100, 0.0),     # 변화 없음
            (5, 0, 0.0),         # 0 제수 → 0 (ZeroDivision 방지)
            (0, 0, 0.0),
            (133, 100, 33.0),
        ],
    )
    def test_safe_pct(self, new, old, expected):
        assert _safe_pct(new, old) == expected

    def test_safe_pct_rounds_to_2dp(self):
        assert _safe_pct(1, 3) == round((1 - 3) / 3 * 100, 2)


class TestSafeDiv:
    @pytest.mark.parametrize(
        "num, den, expected",
        [
            (1, 4, 0.25),
            (1, 3, 0.3333),   # 4자리 반올림
            (5, 0, 0.0),      # 0 제수 → 0
            (0, 10, 0.0),
            (50, 1000, 0.05),
        ],
    )
    def test_safe_div(self, num, den, expected):
        assert _safe_div(num, den) == expected


class TestCompare:
    def test_compare_aggregates_and_computes_changes(self, monkeypatch):
        curr = {
            "네이버SA": MediaKPI("네이버SA", cost=200.0, conversions=20, revenue=2000.0),
            "카카오SA": MediaKPI("카카오SA", cost=100.0, conversions=5, revenue=500.0),
        }
        prev = {
            "네이버SA": MediaKPI("네이버SA", cost=100.0, conversions=10, revenue=1000.0),
            # 카카오SA 는 전월에 없음 → curr 에만 존재(신규 매체)
        }

        def fake_query(_db, year, month):
            return curr if (year, month) == (2026, 6) else prev

        monkeypatch.setattr(analysis_service, "_query_kpis", fake_query)

        result = AnalysisService(db=None).compare(2026, 6, 2026, 5)

        # 전체 합계
        assert result.curr_cost == 300.0
        assert result.prev_cost == 100.0
        assert result.curr_conversions == 25
        assert result.prev_conversions == 10
        assert result.curr_revenue == 2500.0
        assert result.prev_revenue == 1000.0

        # 전체 변화율
        assert result.cost_chg == 200.0   # 100 → 300
        assert result.conv_chg == 150.0   # 10 → 25
        assert result.revenue_chg == 150.0

        # 매체별: 두 기간 매체의 합집합, 정렬됨
        types = [m.campaign_type for m in result.by_media]
        assert types == sorted(["네이버SA", "카카오SA"])

        naver = next(m for m in result.by_media if m.campaign_type == "네이버SA")
        assert naver.cost_chg == 100.0  # 100 → 200

        # prev 에 없던 카카오SA 는 prev KPI 가 0 → 변화율 0 (0 제수 방지)
        kakao = next(m for m in result.by_media if m.campaign_type == "카카오SA")
        assert kakao.prev.cost == 0.0
        assert kakao.cost_chg == 0.0


class TestTrend:
    @pytest.mark.parametrize(
        "now_chg, prev_chg, expected",
        [
            (10.0, 20.0, "2개월 연속 증가"),
            (-10.0, -20.0, "2개월 연속 감소"),
            (30.0, -40.0, "반등"),        # 전월 급락 후 회복 — '성장'과 구분돼야 한다
            (-30.0, 40.0, "조정"),        # 전월 급등의 되돌림
            (0.0, 15.0, "보합"),
            (0.0, 0.0, "보합"),
        ],
    )
    def test_trend(self, now_chg, prev_chg, expected):
        assert _trend(now_chg, prev_chg) == expected


class TestCompareThreeMonths:
    """당월/전월/전전월 3개월 비교."""

    def _run(self, monkeypatch, maps):
        def fake_query(_db, year, month):
            return maps.get((year, month), {})

        monkeypatch.setattr(analysis_service, "_query_kpis", fake_query)
        return AnalysisService(db=None).compare(2026, 6, 2026, 5)

    def test_prev2_defaults_to_month_before_prev(self, monkeypatch):
        seen = []

        def fake_query(_db, year, month):
            seen.append((year, month))
            return {}

        monkeypatch.setattr(analysis_service, "_query_kpis", fake_query)
        result = AnalysisService(db=None).compare(2026, 6, 2026, 5)

        assert seen == [(2026, 6), (2026, 5), (2026, 4)]
        assert (result.prev2_year, result.prev2_month) == (2026, 4)

    def test_prev2_crosses_year_boundary(self, monkeypatch):
        monkeypatch.setattr(analysis_service, "_query_kpis", lambda *_: {})
        result = AnalysisService(db=None).compare(2026, 2, 2026, 1)
        assert (result.prev2_year, result.prev2_month) == (2025, 12)

    def test_rebound_is_not_reported_as_growth(self, monkeypatch):
        # 4월 200 → 5월 100(급락) → 6월 150(회복). 전월 대비 +50%지만 4월 수준엔 못 미친다.
        result = self._run(monkeypatch, {
            (2026, 6): {"네이버SA": MediaKPI("네이버SA", cost=150.0)},
            (2026, 5): {"네이버SA": MediaKPI("네이버SA", cost=100.0)},
            (2026, 4): {"네이버SA": MediaKPI("네이버SA", cost=200.0)},
        })

        assert result.has_prev2 is True
        assert result.prev2_cost == 200.0
        assert result.cost_chg == 50.0        # 100 → 150
        assert result.prev_cost_chg == -50.0  # 200 → 100
        assert result.cost_trend == "반등"

        naver = result.by_media[0]
        assert naver.prev2.cost == 200.0
        assert naver.cost_trend == "반등"
        assert naver.prev2_missing is False

    def test_two_month_growth_is_marked_as_sustained(self, monkeypatch):
        result = self._run(monkeypatch, {
            (2026, 6): {"네이버SA": MediaKPI("네이버SA", cost=300.0, conversions=30)},
            (2026, 5): {"네이버SA": MediaKPI("네이버SA", cost=200.0, conversions=20)},
            (2026, 4): {"네이버SA": MediaKPI("네이버SA", cost=100.0, conversions=10)},
        })
        assert result.cost_trend == "2개월 연속 증가"
        assert result.conv_trend == "2개월 연속 증가"

    def test_missing_prev2_falls_back_to_two_month_mode(self, monkeypatch):
        result = self._run(monkeypatch, {
            (2026, 6): {"네이버SA": MediaKPI("네이버SA", cost=150.0)},
            (2026, 5): {"네이버SA": MediaKPI("네이버SA", cost=100.0)},
            # 2026-04 데이터 없음
        })
        assert result.has_prev2 is False
        assert result.prev2_cost == 0.0
        assert result.cost_chg == 50.0

    def test_media_new_in_current_month_is_flagged(self, monkeypatch):
        result = self._run(monkeypatch, {
            (2026, 6): {"구글SA": MediaKPI("구글SA", cost=50.0)},
            (2026, 5): {"네이버SA": MediaKPI("네이버SA", cost=100.0)},
            (2026, 4): {"네이버SA": MediaKPI("네이버SA", cost=100.0)},
        })
        # 세 기간의 매체 합집합이 정렬돼 나온다
        assert [m.campaign_type for m in result.by_media] == ["구글SA", "네이버SA"]

        google = next(m for m in result.by_media if m.campaign_type == "구글SA")
        assert google.prev2_missing is True
        assert google.prev2.cost == 0.0
