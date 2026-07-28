"""summary 시트 '전월' 행 채우기 테스트.

템플릿에 없는 기간은 다른 달 시트를 복사해 만드는데, 그 복사본의 전월 행에는
템플릿을 만들 당시의 고정 숫자가 남는다. DB 값으로 덮어쓰지 않으면 MOM 비교가
조용히 틀리므로 이 경로를 검증한다.
"""

import io

import openpyxl
import pandas as pd
import pytest

from app.services.excel_service import (
    PREV_MONTH_ROW,
    TEMPLATE_PATH,
    ExcelService,
    _prev_month_cells,
)

# 실제 6월 실적 (템플릿 하드코딩 값과 같은 수치) — 파생 지표 검산에 쓴다
PREV_TOTALS = {
    "impressions": 4574572,
    "clicks": 103847,
    "cost": 36887933.0,
    "conversions": 7915,
    "revenue": 1015564704.0,
    "signup": 1497.0,
    "purchase": 5298.0,
    "apply": 1119.0,
}


class TestPrevMonthCells:
    def test_derived_metrics_match_template_figures(self):
        cells = _prev_month_cells(PREV_TOTALS)

        assert cells[3] == 4574572                      # 노출
        assert cells[4] == 103847                       # 클릭
        assert round(cells[5], 4) == 0.0227             # CTR
        assert round(cells[6]) == 355                   # CPC
        assert cells[7] == 36887933.0                   # 광고비(vat+)
        assert round(cells[10], 4) == 0.0762            # 전환율
        assert round(cells[11]) == 4661                 # 전환단가
        assert round(cells[16], 4) == 0.0144            # 회원가입률
        assert round(cells[18], 4) == 0.051             # 결제완료율
        assert round(cells[20], 2) == 27.53             # 구매수익률(ROAS)

    def test_conversions_excluding_apply(self):
        cells = _prev_month_cells(PREV_TOTALS)
        # 신청제외 전환 = 총전환 7915 - 설명회신청 1119
        assert cells[12] == 6796

    def test_markup_cost_is_blank(self):
        # DB에 markup 광고비가 없다 — 옛 숫자를 남기느니 비운다
        assert _prev_month_cells(PREV_TOTALS)[8] is None

    def test_zero_denominators_do_not_raise(self):
        empty = dict.fromkeys(PREV_TOTALS, 0)
        cells = _prev_month_cells(empty)
        assert all(v == 0 for k, v in cells.items() if k != 8)


def _kpi_frame(year: int, month: int, days: int) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "date": f"{year}-{month:02d}-{day:02d}",
                "impressions": 100 * day,
                "clicks": 10 * day,
                "cost": 1000 * day,
                "total_conv": day,
                "signup": day,
                "purchase": day,
                "revenue": 5000 * day,
                "apply": day,
            }
            for day in range(1, days + 1)
        ]
    )


@pytest.mark.skipif(not TEMPLATE_PATH.exists(), reason="report_template.xlsx 없음")
class TestFillTemplatePrevMonthRow:
    """템플릿에 없는 기간(26년 8월)을 시트 복사로 만드는 경로."""

    @staticmethod
    def _summary(prev_totals):
        kpis = {
            label: _kpi_frame(2026, 8, 31)
            for label in ("네이버SA", "네이버BS", "카카오SA", "구글SA", "네이버PSA")
        }
        raw = ExcelService().fill_template(kpis, "26년 8월", 2026, 8, prev_totals)
        return openpyxl.load_workbook(io.BytesIO(raw))["summary_26년 8월"]

    def test_prev_totals_overwrite_stale_numbers(self):
        ws = self._summary(PREV_TOTALS)

        assert ws.cell(PREV_MONTH_ROW, 2).value.strftime("%Y-%m") == "2026-07"
        assert ws.cell(PREV_MONTH_ROW, 3).value == 4574572
        assert ws.cell(PREV_MONTH_ROW, 7).value == 36887933.0
        # 템플릿에 남아 있던 markup 숫자(38203774)가 비워졌는지
        assert ws.cell(PREV_MONTH_ROW, 8).value is None

    def test_without_prev_totals_row_is_blanked(self):
        # 전월 데이터가 없으면 남의 달 숫자를 남기지 않는다
        ws = self._summary(None)

        assert ws.cell(PREV_MONTH_ROW, 2).value.strftime("%Y-%m") == "2026-07"
        assert all(ws.cell(PREV_MONTH_ROW, c).value is None for c in range(3, 23))

    def test_output_stays_small(self):
        kpis = {"네이버SA": _kpi_frame(2026, 8, 31)}
        raw = ExcelService().fill_template(kpis, "26년 8월", 2026, 8, PREV_TOTALS)
        # 예전 86MB 템플릿은 출력물이 87MB였다 — 슬림 템플릿 회귀 방지선
        assert len(raw) < 5 * 1024 * 1024
