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
