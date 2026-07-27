"""excel_reader_service 테스트.

- Tier 1: 순수 헬퍼(_safe/_date_str) 및 to_db_dataframe 의 헤더→컬럼 매핑 로직
- Tier 2: read_report — 최소 summary 워크북을 즉석 생성해 시트/셀 오프셋 파싱 검증
"""

from datetime import datetime

import pytest

from app.services.excel_reader_service import (
    ExcelReaderService,
    _date_str,
    _safe,
)


class TestSafe:
    @pytest.mark.parametrize(
        "value, expected",
        [
            (None, 0.0),
            ("3.5", 3.5),
            (10, 10.0),
            ("abc", 0.0),
            (float("nan"), 0.0),
            (float("inf"), 0.0),
        ],
    )
    def test_safe(self, value, expected):
        assert _safe(value) == expected

    def test_safe_custom_default(self):
        assert _safe(None, default=-1.0) == -1.0


class TestDateStr:
    def test_datetime(self):
        assert _date_str(datetime(2026, 6, 1, 13, 30)) == "2026-06-01"

    def test_none(self):
        assert _date_str(None) == ""

    def test_string_truncated_to_10(self):
        assert _date_str("2026-06-01T00:00:00") == "2026-06-01"


class TestToDbDataframe:
    def test_header_column_mapping(self):
        report = {
            "media": {
                "네이버SA": {
                    "headers": [
                        "날짜", "노출수", "클릭수", "광고비(VAT)", "총전환수",
                        "구매매출액", "회원가입", "구매완료", "신청",
                    ],
                    "daily": [
                        ["2026-06-01", 1000, 50, 30000, 5, 500000, 2, 3, 1],
                        ["", 999, 9, 1, 1, 1, 1, 1, 1],  # 날짜 없음 → 제외
                    ],
                    "total": [],
                }
            }
        }
        df = ExcelReaderService().to_db_dataframe(report)

        assert len(df) == 1
        row = df.iloc[0]
        assert row["report_date"] == "2026-06-01"
        assert row["campaign_type"] == "네이버SA"
        assert row["impressions"] == 1000
        assert row["clicks"] == 50
        assert row["cost"] == 30000.0
        assert row["conversions"] == 5
        assert row["conversion_revenue"] == 500000.0
        assert row["signup"] == 2.0
        assert row["purchase"] == 3.0
        assert row["apply"] == 1.0

    def test_missing_optional_columns_default_to_zero(self):
        # 회원가입/구매완료/신청 헤더가 없는 구포맷 → 해당 값 0.0
        report = {
            "media": {
                "카카오SA": {
                    "headers": ["날짜", "노출수", "클릭수", "광고비(VAT)", "총전환수", "구매매출액"],
                    "daily": [["2026-06-01", 500, 20, 10000, 2, 200000]],
                    "total": [],
                }
            }
        }
        df = ExcelReaderService().to_db_dataframe(report)
        row = df.iloc[0]
        assert row["conversion_revenue"] == 200000.0
        assert row["signup"] == 0.0
        assert row["purchase"] == 0.0
        assert row["apply"] == 0.0


class TestReadReport:
    def _summary_cells(self):
        return {
            (3, 2): 10, (3, 3): 20, (3, 4): 30,      # period_info
            (32, 2): "월간 코멘트",                    # comment
            # daily_total 첫 행 (row 70)
            (70, 2): datetime(2026, 6, 1), (70, 3): 1000, (70, 4): 50,
            (70, 5): 0.05, (70, 6): 100, (70, 7): 30000,
            (70, 9): 5, (70, 10): 0.1, (70, 11): 6000,
        }

    def _media_cells(self):
        return {
            (21, 2): "날짜", (21, 3): "노출수", (21, 4): "클릭수",  # headers
            (23, 2): "2026-06-01", (23, 3): 1000, (23, 4): 50,      # daily 첫 행
        }

    def test_read_report_parses_core_sections(self, make_report_xlsx):
        xlsx = make_report_xlsx(
            period="26년6월",
            cells={
                "summary_26년6월": self._summary_cells(),
                "네이버SA_26년6월": self._media_cells(),
            },
        )
        result = ExcelReaderService().read_report(xlsx)

        assert result["period"] == "26년6월"
        assert result["period_info"] == {
            "remaining_days": 10, "elapsed_days": 20, "total_days": 30,
        }
        assert result["comment"] == "월간 코멘트"

        assert len(result["daily_total"]) == 1
        daily = result["daily_total"][0]
        assert daily["date"] == "2026-06-01"
        assert daily["impressions"] == 1000
        assert daily["clicks"] == 50

        assert "네이버SA" in result["media"]
        media = result["media"]["네이버SA"]
        assert media["headers"] == ["날짜", "노출수", "클릭수"]
        assert len(media["daily"]) == 1

        # sa_total 은 항상 8개 비교행(전년/전월/당월/YOY/MOM/전주/금주/WoW)
        assert len(result["sa_total"]["rows"]) == 8
        labels = [r["label"] for r in result["sa_total"]["rows"]]
        assert labels == ["전년", "전월", "당월", "YOY", "MOM", "전주", "금주", "WoW"]

    def test_read_report_without_summary_sheet_raises(self, make_report_xlsx):
        xlsx = make_report_xlsx(period="x", cells={"관계없는시트": {(1, 1): "x"}})
        with pytest.raises(ValueError):
            ExcelReaderService().read_report(xlsx)
