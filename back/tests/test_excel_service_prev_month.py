"""summary 시트 '전월' 행 채우기 테스트.

템플릿에 없는 기간은 다른 달 시트를 복사해 만드는데, 그 복사본의 전월 행에는
템플릿을 만들 당시의 고정 숫자가 남는다. DB 값으로 덮어쓰지 않으면 MOM 비교가
조용히 틀리므로 이 경로를 검증한다.
"""

import io
import re
import zipfile

import openpyxl
import pandas as pd
import pytest

from app.services.excel_service import (
    PREV_MONTH_ROW,
    YOY_ROW,
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


_ALL_MEDIA = ("네이버SA", "네이버BS", "카카오SA", "구글SA", "네이버PSA")


def _export(period: str, year: int, month: int, days: int, yoy: dict | None = None):
    kpis = {label: _kpi_frame(year, month, days) for label in _ALL_MEDIA}
    raw = ExcelService().fill_template(kpis, period, year, month, None, yoy)
    return openpyxl.load_workbook(io.BytesIO(raw))


def _template_period() -> str:
    """템플릿이 담고 있는 기간 — 템플릿이 갱신돼도 테스트가 따라가게 파일에서 읽는다."""
    wb = openpyxl.load_workbook(TEMPLATE_PATH, read_only=True)
    try:
        return next(n[len("summary_"):] for n in wb.sheetnames if n.startswith("summary_"))
    finally:
        wb.close()


@pytest.mark.skipif(not TEMPLATE_PATH.exists(), reason="report_template.xlsx 없음")
class TestExportContainsOnlyRequestedPeriod:
    """템플릿은 최신 한 기간만 갖고 있고, 다른 기간은 그 시트를 복사해 만든다.

    복사 원본을 남겨두면 5월 파일에도 템플릿의 기간 시트가 함께 담겨서,
    받는 사람이 파일을 열면 '전부 그 달'로 보인다.
    """

    def test_other_period_sheets_are_removed(self):
        wb = _export("26년 8월", 2026, 8, 31)

        assert all(name.endswith("26년 8월") for name in wb.sheetnames), wb.sheetnames
        assert len(wb.sheetnames) == len(_ALL_MEDIA) + 1  # 매체 5개 + summary

    def test_summary_is_the_sheet_excel_opens(self):
        assert _export("26년 8월", 2026, 8, 31).active.title == "summary_26년 8월"

    def test_no_formula_references_a_removed_sheet(self):
        """지운 시트를 가리키는 수식이 남으면 Excel에서 #REF! 가 된다."""
        wb = _export("26년 8월", 2026, 8, 31)
        names = set(wb.sheetnames)

        dangling = [
            (sheet, cell.coordinate, ref)
            for sheet in wb.sheetnames
            for row in wb[sheet].iter_rows()
            for cell in row
            if isinstance(cell.value, str) and cell.value.startswith("=")
            for ref in re.findall(r"'([^']+)'!", cell.value)
            if ref not in names
        ]
        assert dangling == []

    def test_template_period_export_keeps_its_sheets(self):
        """템플릿과 같은 기간이면 복사가 일어나지 않는다 — 지울 것도 없어야 한다."""
        period = _template_period()
        wb = _export(period, 2026, 7, 31)

        assert [n for n in wb.sheetnames if n.endswith(period)] == wb.sheetnames
        assert f"summary_{period}" in wb.sheetnames


_YOY_SAMPLE = {
    "impressions": 111, "clicks": 22, "cost": 3300.0, "conversions": 44,
    "revenue": 5.0, "signup": 6.0, "purchase": 7.0, "apply": 8.0,
}


@pytest.mark.skipif(not TEMPLATE_PATH.exists(), reason="report_template.xlsx 없음")
class TestYearAgoRow:
    """매체 시트 8행(전년동월).

    템플릿은 이 행을 외부 통합문서(=[1]네이버SA_7월!C22)에서 끌어온다. 받는 사람에게는
    그 파일이 없어 빈칸이 되고, 이 행을 합산하는 summary 7행과 YOY 행까지 함께 비었다.
    """

    def test_no_external_workbook_reference_survives(self):
        wb = _export("26년 8월", 2026, 8, 31)
        leftover = [
            (name, cell.coordinate)
            for name in wb.sheetnames
            for row in wb[name].iter_rows()
            for cell in row
            if isinstance(cell.value, str) and "[1]" in cell.value
        ]
        assert leftover == []

    def test_values_are_written_when_data_exists(self):
        wb = _export("26년 8월", 2026, 8, 31, {"네이버SA": _YOY_SAMPLE})
        ws = wb["네이버SA_26년 8월"]

        assert ws.cell(YOY_ROW, 3).value == 111    # 노출
        assert ws.cell(YOY_ROW, 4).value == 22     # 클릭
        assert ws.cell(YOY_ROW, 7).value == 3300   # 광고비
        assert ws.cell(YOY_ROW, 8).value == 44     # 총전환수
        assert ws.cell(YOY_ROW, 11).value == 36    # 총전환수(신청제외) = 44 - 8

    def test_missing_media_is_filled_with_zero(self):
        # 1년 전 데이터가 아예 없는 매체 — 빈칸으로 두면 YOY가 조용히 비어버린다
        wb = _export("26년 8월", 2026, 8, 31, {"네이버SA": _YOY_SAMPLE})
        ws = wb["카카오SA_26년 8월"]

        assert [ws.cell(YOY_ROW, c).value for c in (3, 4, 7, 8, 11, 13)] == [0, 0, 0, 0, 0, 0]

    def test_formulas_are_left_alone(self):
        """값 셀만 바꾸고 계산 로직은 템플릿 그대로 둔다."""
        wb = _export("26년 8월", 2026, 8, 31, {"네이버SA": _YOY_SAMPLE})

        ws = wb["네이버SA_26년 8월"]
        assert ws.cell(YOY_ROW, 5).value == "=IFERROR(D8/C8,)"   # CTR
        assert ws.cell(YOY_ROW, 6).value == "=IFERROR(G8/D8,)"   # CPC

        summary = wb["summary_26년 8월"]
        assert summary.cell(7, 3).value.startswith("=SUM(")       # 전년동월 합계
        assert summary.cell(10, 3).value == "=IFERROR(C9/C7-1,)"  # YOY

    def test_external_link_definition_is_dropped(self):
        """참조를 다 없앴으므로 링크 정의도 남기지 않는다 — Excel의 '링크 업데이트' 질문 방지."""
        kpis = {label: _kpi_frame(2026, 8, 31) for label in _ALL_MEDIA}
        raw = ExcelService().fill_template(kpis, "26년 8월", 2026, 8, None, None)

        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            assert [n for n in z.namelist() if "externalLink" in n] == []
            assert "externalReferences" not in z.read("xl/workbook.xml").decode("utf-8")
