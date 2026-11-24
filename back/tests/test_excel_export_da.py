"""내보내기에 DA 매체가 반영되는지 — 템플릿 배선과 적재를 함께 지킨다.

대행사 주간 리포트 양식이 들어오면서 DB에 DA 매체 3종(`구글DA`·`카카오DA`·`기타DA`)이
생겼는데, 내보내기 템플릿에는 그 시트가 없어 export 가 DA를 **조용히 빼고** 파일을
만들었다. 크래시가 없으니 테스트도 통과했고, 화면 TOTAL 과 내보낸 파일 숫자만 달랐다.

템플릿은 바이너리라 git diff 로 수식 변화를 볼 수 없다. 그래서 여기서 **템플릿 자체의
배선**을 검증한다 — 누가 reset_report_template 만 돌리고 add_da_sheets_to_template 를
빠뜨리면 이 테스트가 먼저 깨진다.
"""

import io

import openpyxl
import pandas as pd
import pytest

from app.services.excel_service import (
    PLACEHOLDER,
    SHEET_PREFIX,
    TEMPLATE_PATH,
    _AGGREGATE_COLS,
    _SHEET_COLS,
    ExcelService,
)

DA_LABELS = ("구글DA", "카카오DA", "기타DA")
#: summary 합계가 반드시 참조해야 하는 매체 시트(템플릿 시트명 기준)
ALL_MEDIA_SHEETS = tuple(f"{prefix}_{PLACEHOLDER}" for prefix in SHEET_PREFIX.values())

#: summary 당월 행에서 "모든 매체를 더해야 하는" 컬럼 → 설명이 붙은 이름.
#: 설명회신청(22)은 제외한다 — 카카오SA·파워컨텐츠에는 그 지표 컬럼이 아예 없다.
SUMMARY_TOTAL_COLS = {3: "노출", 4: "클릭", 7: "광고비(vat+)", 9: "총전환수",
                      15: "회원가입", 17: "구매완료", 19: "구매매출"}

SUMMARY_CURR_ROW = 9       # 당월
SUMMARY_YOY_ROW = 7        # 전년동월
SUMMARY_DAILY_FIRST = 70   # 일별 첫 행

needs_template = pytest.mark.skipif(not TEMPLATE_PATH.exists(), reason="report_template.xlsx 없음")


@pytest.fixture(scope="module")
def template():
    return openpyxl.load_workbook(TEMPLATE_PATH)


def _kpi_frame(year: int, month: int, days: int, scale: int = 1) -> pd.DataFrame:
    return pd.DataFrame([
        {
            "date": f"{year}-{month:02d}-{day:02d}",
            "impressions": 100 * day * scale,
            "clicks": 10 * day * scale,
            "cost": 1000 * day * scale,
            "total_conv": 3 * day,
            "signup": day,
            "purchase": day,
            "revenue": 5000 * day * scale,
            "apply": day,
        }
        for day in range(1, days + 1)
    ])


# ── 매체 등록 테이블 정합성 ───────────────────────────────────────────────────────

def test_da_labels_registered_in_every_table():
    """세 테이블 중 하나만 빠뜨리면 export 가 조용히 그 매체를 건너뛴다."""
    for label in DA_LABELS:
        assert label in SHEET_PREFIX, f"SHEET_PREFIX 에 {label} 없음"
        assert label in _SHEET_COLS, f"_SHEET_COLS 에 {label} 없음"
        assert label in _AGGREGATE_COLS, f"_AGGREGATE_COLS 에 {label} 없음"


def test_sheet_tables_cover_the_same_media():
    assert set(SHEET_PREFIX) == set(_SHEET_COLS) == set(_AGGREGATE_COLS)


# ── 템플릿 배선 ──────────────────────────────────────────────────────────────────

@needs_template
def test_template_has_da_sheets(template):
    for label in DA_LABELS:
        assert f"{label}_{PLACEHOLDER}" in template.sheetnames, template.sheetnames


@needs_template
@pytest.mark.parametrize("row", [SUMMARY_YOY_ROW, SUMMARY_CURR_ROW, SUMMARY_DAILY_FIRST])
def test_summary_totals_reference_every_media_sheet(template, row):
    """합계 수식이 매체 하나라도 빠뜨리면 내보낸 리포트가 그만큼 적게 나온다.

    DA 가 빠져 있었던 것이 이번 작업의 발단이고, 같은 수식에서 파워컨텐츠(네이버PSA)도
    광고비·총전환수·회원가입·구매완료·구매매출 다섯 칸에서 빠져 있었다 — 월 360만~490만
    원이 조용히 누락됐다. 둘 다 이 테스트가 막는다.
    """
    ws = template[f"summary_{PLACEHOLDER}"]
    for col, name in SUMMARY_TOTAL_COLS.items():
        formula = ws.cell(row, col).value
        assert isinstance(formula, str) and formula.startswith("="), f"{name}: 수식이 아님"
        missing = [s for s in ALL_MEDIA_SHEETS if f"'{s}'!" not in formula]
        assert not missing, f"{row}행 {name}: {missing} 가 합계에서 빠졌습니다 — {formula}"


@needs_template
def test_da_sheet_layout_matches_naver_sa(template):
    """DA 시트는 네이버SA 시트를 복사해 만든다 — _SHEET_COLS 가 같은 좌표를 쓰는 근거."""
    source = template[f"네이버SA_{PLACEHOLDER}"]
    expected = [source.cell(21, c).value for c in range(2, 23)]
    for label in DA_LABELS:
        ws = template[f"{label}_{PLACEHOLDER}"]
        assert [ws.cell(21, c).value for c in range(2, 23)] == expected, label


@needs_template
def test_da_sheet_section_title_is_relabelled(template):
    """복사 흔적("■ naver SA")이 남으면 받는 사람이 DA 시트를 네이버SA로 읽는다."""
    for label in DA_LABELS:
        title = template[f"{label}_{PLACEHOLDER}"].cell(20, 2).value
        assert isinstance(title, str) and "DA" in title, (label, title)
        assert "naver SA" not in title, (label, title)


@needs_template
def test_comment_merge_and_daily_row_did_not_shift(template):
    """예산 구간에 DA 합계 행을 넣으면서 아래 좌표가 밀리지 않았는지.

    B32 코멘트 병합과 일별 첫 행(70)은 쓰는 쪽·읽는 쪽·템플릿 생성기 세 곳에 상수로
    박혀 있고, 읽는 쪽은 고객사가 보내 주는 기존 레이아웃 파일도 같은 좌표로 파싱한다.
    """
    ws = template[f"summary_{PLACEHOLDER}"]
    assert "B32:W65" in [str(r) for r in ws.merged_cells.ranges]
    assert ws.cell(31, 2).value == "■ comment"
    # 70행은 매체 시트의 일별 첫 행(23)을 가리켜야 한다
    assert "!C23" in str(ws.cell(SUMMARY_DAILY_FIRST, 3).value)


@needs_template
def test_budget_section_has_da_and_grand_total_rows(template):
    ws = template[f"summary_{PLACEHOLDER}"]
    assert ws.cell(29, 3).value == "DA total"
    assert ws.cell(30, 3).value == "TOTAL (SA+DA)"
    # 28행은 DA를 포함하지 않는 합계라는 것이 이름에 드러나야 한다
    assert ws.cell(28, 3).value == "SA+BS+PSA total"
    # DA 합계 행은 DA 시트만 참조한다
    formula = str(ws.cell(29, 10).value)
    assert all(f"'{label}_{PLACEHOLDER}'!" in formula for label in DA_LABELS), formula
    assert f"네이버SA_{PLACEHOLDER}" not in formula, formula


# ── 실제 내보내기 ────────────────────────────────────────────────────────────────

@needs_template
def test_export_fills_da_sheets():
    """DA 데이터를 주면 DA 시트 일별 구간에 값이 들어가야 한다."""
    kpis = {label: _kpi_frame(2026, 8, 31) for label in SHEET_PREFIX}
    raw = ExcelService().fill_template(kpis, "26년 8월", 2026, 8)
    wb = openpyxl.load_workbook(io.BytesIO(raw))

    for label in DA_LABELS:
        ws = wb[f"{label}_26년 8월"]
        assert ws.cell(23, 3).value == 100, label      # 1일 노출
        assert ws.cell(23, 4).value == 10, label       # 1일 클릭
        assert ws.cell(23, 7).value == 1000, label     # 1일 광고비
        assert ws.cell(53, 3).value == 3100, label     # 31일 노출
        assert ws.cell(23, 14).value == 1, label       # 회원가입
        assert ws.cell(23, 16).value == 1, label       # 구매완료
        assert ws.cell(23, 18).value == 5000, label    # 구매매출
        assert ws.cell(23, 21).value == 1, label       # 설명회신청


@needs_template
def test_export_without_da_data_leaves_da_sheets_empty():
    """DA 가 없는 과거 달도 그대로 내보내져야 한다 — 시트는 있고 값은 비어 있다."""
    kpis = {
        label: _kpi_frame(2025, 3, 31)
        for label in SHEET_PREFIX
        if label not in DA_LABELS
    }
    raw = ExcelService().fill_template(kpis, "25년 3월", 2025, 3)
    wb = openpyxl.load_workbook(io.BytesIO(raw))

    for label in DA_LABELS:
        ws = wb[f"{label}_25년 3월"]
        assert ws.cell(23, 3).value is None, label
        assert ws.cell(23, 7).value is None, label


@needs_template
def test_da_aggregate_rows_are_filled():
    """매체 시트의 전년동월(8행)·전월(9행)은 DB 합계를 직접 써 넣는다."""
    kpis = {label: _kpi_frame(2026, 8, 31) for label in SHEET_PREFIX}
    totals = {"impressions": 5000, "clicks": 500, "cost": 50000.0,
              "signup": 10.0, "purchase": 20.0, "revenue": 90000.0, "apply": 5.0}
    raw = ExcelService().fill_template(
        kpis, "26년 8월", 2026, 8,
        yoy_media_totals={label: dict(totals) for label in DA_LABELS},
        prev_media_totals={label: dict(totals) for label in DA_LABELS},
    )
    wb = openpyxl.load_workbook(io.BytesIO(raw))

    for label in DA_LABELS:
        ws = wb[f"{label}_26년 8월"]
        for row in (8, 9):
            assert ws.cell(row, 3).value == 5000, (label, row)
            assert ws.cell(row, 7).value == 50000.0, (label, row)
            assert ws.cell(row, 18).value == 90000.0, (label, row)
