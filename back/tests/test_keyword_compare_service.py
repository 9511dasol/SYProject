"""keyword_compare_service 순수 파싱/비교 로직 테스트."""

from datetime import date

import pytest

from app.services.keyword_compare_service import (
    _build_sheet_result,
    _compare_periods,
    _extract_period,
    _period_end_date,
    _row_status,
    _safe_float,
    _safe_str,
)


class TestSafeFloat:
    @pytest.mark.parametrize(
        "value, expected",
        [
            ("3.5", 3.5),
            (10, 10.0),
            (None, 0.0),          # float(None) 예외 → 0
            ("abc", 0.0),         # 파싱 불가 → 0
            (float("nan"), 0.0),  # NaN → 0
            (float("inf"), 0.0),  # inf → 0
            (float("-inf"), 0.0),
        ],
    )
    def test_safe_float(self, value, expected):
        assert _safe_float(value) == expected


class TestSafeStr:
    @pytest.mark.parametrize(
        "value, expected",
        [
            (None, ""),
            ("  hello  ", "hello"),
            ("nan", ""),
            ("None", ""),
            ("NaN", ""),
            (123, "123"),
            (float("nan"), ""),  # str(nan)=="nan" → 걸러짐
        ],
    )
    def test_safe_str(self, value, expected):
        assert _safe_str(value) == expected


class TestExtractPeriod:
    def test_extracts_period_with_trailing_dots(self):
        assert _extract_period("보고서 (2026.06.01.~2026.06.30.)") == "2026.06.01.~2026.06.30."

    def test_extracts_period_without_trailing_dots(self):
        assert _extract_period("(2026.06.01~2026.06.30)") == "2026.06.01~2026.06.30"

    def test_no_match_returns_raw(self):
        assert _extract_period("기간정보없음") == "기간정보없음"


class TestPeriodEndDate:
    def test_parses_end_date(self):
        assert _period_end_date("2026.06.01.~2026.06.30.") == date(2026, 6, 30)

    def test_invalid_calendar_date_returns_none(self):
        assert _period_end_date("2026.06.01.~2026.13.30.") is None  # 13월

    def test_no_tilde_returns_none(self):
        assert _period_end_date("2026.06.30") is None


class TestRowStatus:
    @pytest.mark.parametrize(
        "curr, prev, diff, expected",
        [
            (5, 0, 5, "new"),    # 전기 0 · 당기 > 0
            (0, 5, -5, "gone"),  # 당기 0 · 전기 > 0
            (5, 3, 2, "up"),
            (3, 5, -2, "down"),
            (5, 5, 0, "same"),
            (0, 0, 0, "same"),
        ],
    )
    def test_row_status(self, curr, prev, diff, expected):
        assert _row_status(curr, prev, diff) == expected


class TestBuildSheetResult:
    def test_summary_counts_and_dimensions(self):
        rows = [
            {"campaign_type": "A", "device": "PC", "keyword": "k1", "conv_type": "구매",
             "curr_conv": 10, "curr_amount": 1000, "prev_conv": 0, "prev_amount": 0,
             "diff_conv": 10, "diff_amount": 1000, "status": "new"},
            {"campaign_type": "A", "device": "MO", "keyword": "k2", "conv_type": "가입",
             "curr_conv": 5, "curr_amount": 500, "prev_conv": 3, "prev_amount": 300,
             "diff_conv": 2, "diff_amount": 200, "status": "up"},
        ]
        result = _build_sheet_result("시트1", "P1 → P2", rows)

        assert result["name"] == "시트1"
        assert result["period"] == "P1 → P2"
        s = result["summary"]
        assert s["total_curr_conv"] == 15
        assert s["total_prev_conv"] == 3
        assert s["diff_conv"] == 12
        assert s["count_new"] == 1
        assert s["count_up"] == 1
        assert s["count_down"] == 0
        # 차원 목록은 정렬된 유니크 집합
        assert result["campaign_types"] == ["A"]
        assert result["devices"] == ["MO", "PC"]
        assert result["conv_types"] == ["가입", "구매"]


class TestComparePeriods:
    def test_matches_by_key_and_classifies(self):
        curr = {
            "period": "P2",
            "name": "sheet_curr",
            "entries": {
                ("A", "PC", "k1", "구매"): {"conv": 10.0, "amount": 1000.0},  # 신규
                ("A", "PC", "k2", "구매"): {"conv": 5.0, "amount": 500.0},    # 증가
            },
        }
        prev = {
            "period": "P1",
            "name": "sheet_prev",
            "entries": {
                ("A", "PC", "k2", "구매"): {"conv": 3.0, "amount": 300.0},
                ("A", "PC", "k3", "구매"): {"conv": 2.0, "amount": 200.0},  # 소멸
            },
        }

        result = _compare_periods(curr, prev)

        assert result["period"] == "P1 → P2"
        by_kw = {r["keyword"]: r for r in result["rows"]}
        assert by_kw["k1"]["status"] == "new"
        assert by_kw["k2"]["status"] == "up"
        assert by_kw["k2"]["diff_conv"] == 2.0
        assert by_kw["k3"]["status"] == "gone"
        assert by_kw["k3"]["diff_conv"] == -2.0

        s = result["summary"]
        assert s["count_new"] == 1
        assert s["count_up"] == 1
        assert s["count_gone"] == 1
        assert s["total_curr_conv"] == 15.0
        assert s["total_prev_conv"] == 5.0

    def test_no_prev_period(self):
        curr = {
            "period": "P2",
            "name": "sheet_curr",
            "entries": {("A", "PC", "k1", "구매"): {"conv": 10.0, "amount": 1000.0}},
        }
        result = _compare_periods(curr, None)
        assert result["period"] == "P2"  # prev 없으면 그대로
        assert result["rows"][0]["status"] == "new"
