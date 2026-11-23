"""엑셀 리포트 파서의 출력이 응답 계약과 어긋나지 않아야 한다.

excel_reader_service 는 순수 dict 를 돌려주고 프론트(types/marketing.ts)는 그 모양을
손으로 베껴 둔 타입으로 받는다. 그래서 파서가 키 이름을 바꾸거나 칸을 빠뜨려도
백엔드에서는 아무도 걸러내지 않고 화면에서 조용히 undefined 가 됐다.

이제 /load-excel 이 ExcelReportBundle 을 response_model 로 쓰므로, 파서 출력이
계약을 벗어나면 서버에서 걸린다. 그 계약이 실제 파서 출력과 맞는지를 여기서 고정한다.
"""

import pytest
from pydantic import ValidationError

from app.schemas.excel_report_schema import ExcelReport, ExcelReportBundle, SaTotalRow
from app.services.excel_reader_service import SA_TOTAL_COLS, ExcelReaderService


@pytest.fixture
def report_bytes(make_report_xlsx) -> bytes:
    """summary 시트의 주요 칸을 채운 최소 워크북."""
    cells = {
        # 기간 정보 (3행)
        (3, 2): 10, (3, 3): 20, (3, 4): 30,
        # sa_total 헤더 (6행) + 당월 행 (9행)
        (6, 2): "날짜", (6, 3): "노출수", (6, 4): "클릭수",
        (9, 2): "2026-06-30", (9, 3): 1000, (9, 4): 50,
        # 예산 표 (21행~)
        (21, 3): "네이버SA", (21, 4): 1_000_000, (21, 5): 400_000, (21, 6): 0.4,
        (21, 10): 5000, (21, 11): 250, (21, 12): 400_000,
        # 코멘트 (32행)
        (32, 2): "6월 성과 요약",
        # 일별 합계 (70행~)
        (70, 2): "2026-06-01", (70, 3): 500, (70, 4): 25, (70, 7): 20_000,
        (71, 2): "2026-06-02", (71, 3): 500, (71, 4): 25, (71, 7): 20_000,
    }
    return make_report_xlsx("26년 6월", {"summary_26년 6월": cells})


# ── 계약 적합성 ──────────────────────────────────────────────────────────────


def test_parser_output_satisfies_the_response_contract(report_bytes):
    """가장 중요한 지점 — 파서가 내놓는 dict 가 그대로 계약을 통과해야 한다."""
    reports = ExcelReaderService().read_reports(report_bytes)

    bundle = ExcelReportBundle.model_validate(
        {"periods": [r["period"] for r in reports], "reports": reports}
    )

    assert bundle.periods == ["26년 6월"]
    assert len(bundle.reports) == 1


def test_contract_keeps_the_parsed_values(report_bytes):
    """검증을 통과하는 것만으로는 부족하다 — 값이 그대로 실려 와야 한다."""
    report = ExcelReport.model_validate(ExcelReaderService().read_reports(report_bytes)[0])

    assert report.period == "26년 6월"
    assert report.comment == "6월 성과 요약"
    assert (report.period_info.remaining_days, report.period_info.total_days) == (10, 30)

    assert [b.category for b in report.budget_table] == ["네이버SA"]
    assert report.budget_table[0].budget == 1_000_000

    assert len(report.daily_total) == 2
    assert report.daily_total[0].impressions == 500
    assert report.daily_total[0].cost == 20_000


def test_sa_total_comparison_rows_are_all_present(report_bytes):
    """전년·전월·당월·YOY·MOM·전주·금주·WoW 8줄이 빠짐없이 와야 한다."""
    report = ExcelReport.model_validate(ExcelReaderService().read_reports(report_bytes)[0])

    assert [row.label for row in report.sa_total.rows] == [
        "전년", "전월", "당월", "YOY", "MOM", "전주", "금주", "WoW",
    ]
    current = next(r for r in report.sa_total.rows if r.label == "당월")
    assert (current.impressions, current.clicks) == (1000, 50)


# ── 계약이 파서와 같은 칸 목록을 쓰는가 ──────────────────────────────────────


def test_contract_covers_every_column_the_parser_emits():
    """파서에 칸을 추가하고 계약을 빠뜨리면 응답에서 조용히 사라진다 — 그걸 막는다."""
    contract_fields = set(SaTotalRow.model_fields)
    parser_fields = set(SA_TOTAL_COLS) | {"label"}

    assert parser_fields - contract_fields == set(), "계약에 없는 칸이 파서에 있다"
    assert contract_fields - parser_fields == set(), "파서가 내보내지 않는 칸이 계약에 있다"


# ── 어긋나면 실제로 걸리는가 ─────────────────────────────────────────────────


def test_missing_required_field_is_rejected():
    """계약이 느슨하면 아무것도 못 잡는다 — 필수 칸이 빠지면 걸려야 한다."""
    with pytest.raises(ValidationError):
        ExcelReport.model_validate({"period": "26년 6월"})  # period_info·sa_total 누락


def test_renamed_key_is_rejected_for_budget_rows():
    """category 를 다른 이름으로 바꾸면(파서 드리프트) 걸려야 한다."""
    with pytest.raises(ValidationError):
        ExcelReport.model_validate({
            "period": "26년 6월",
            "period_info": {"remaining_days": 0, "elapsed_days": 0, "total_days": 0},
            "sa_total": {"headers": [], "rows": []},
            "budget_table": [{"이름": "네이버SA"}],   # category 가 아니다
        })


def test_media_sheet_accepts_mixed_cell_types(report_bytes):
    """매체 시트 칸은 숫자·문자·빈칸이 섞인다 — 타입을 좁히면 멀쩡한 파일이 막힌다."""
    sheet = {
        "headers": ["일자", "노출수"],
        "total": ["합계", 1000],
        "daily": [["2026-06-01", 500], ["2026-06-02", None]],
    }
    report = ExcelReport.model_validate({
        "period": "26년 6월",
        "period_info": {"remaining_days": 0, "elapsed_days": 0, "total_days": 0},
        "sa_total": {"headers": [], "rows": []},
        "budget_table": [],
        "comment": "",
        "daily_total": [],
        "media": {"네이버SA": sheet},
    })

    assert report.media["네이버SA"].daily[1][1] is None


def test_media_sheet_accepts_values_openpyxl_returns_from_formulas():
    """수식 칸은 bool 이나 Decimal 로 올 수 있다 — 타입을 좁히면 멀쩡한 파일이 막힌다."""
    from decimal import Decimal

    report = ExcelReport.model_validate({
        "period": "26년 6월",
        "period_info": {"remaining_days": 0, "elapsed_days": 0, "total_days": 0},
        "sa_total": {"headers": [], "rows": []},
        "budget_table": [],
        "comment": "",
        "daily_total": [],
        "media": {"네이버SA": {"headers": ["a"], "total": [True], "daily": [[Decimal("1.5")]]}},
    })

    assert report.media["네이버SA"].total == [True]
