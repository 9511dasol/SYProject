"""양식 레지스트리 테스트 — 업로드된 파일이 올바른 리더로 가는지.

양식이 둘(월간 템플릿 / 주간 리포트)이 되면서, 잘못 고르면 "읽히긴 했는데 숫자가
이상한" 조용한 실패가 난다. 판별을 테스트로 묶어 둔다.
"""

import datetime as dt

import pytest

from app.core.uploads import REPORT_EXTENSIONS
from app.services.report_formats import (
    FORMATS,
    SUPPORTED_EXTENSIONS,
    MonthlyTemplateFormat,
    WeeklyRawFormat,
    detect,
)
from tests.conftest import weekly_raw_row

D = dt.date


def test_report_extensions_match_registry():
    """core/uploads 는 services 를 import 하지 않으므로 값이 두 곳에 있다 — 어긋나면
    업로드가 415 로 막히거나, 반대로 읽지 못하는 확장자를 받아 500 이 난다."""
    assert REPORT_EXTENSIONS == SUPPORTED_EXTENSIONS


def test_registered_formats_satisfy_protocol():
    """새 양식을 FORMATS 에 넣을 때 필요한 메서드를 빠뜨리지 않게 한다."""
    for fmt in FORMATS:
        assert isinstance(fmt.name, str) and fmt.name
        assert isinstance(fmt.label, str) and fmt.label
        assert fmt.extensions
        for method in ("list_period_summaries", "read_reports", "to_db_dataframe"):
            assert callable(getattr(fmt, method, None)), f"{fmt.name}.{method}"
        assert callable(getattr(fmt, "matches_sheets", None)), f"{fmt.name}.matches_sheets"


def test_detects_weekly_raw(make_weekly_raw_xlsx):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1, clicks=1),
    ])
    assert isinstance(detect(content, "Weekly Report_26년11월4주차.xlsx"), WeeklyRawFormat)


def test_detects_monthly_template(make_report_xlsx):
    content = make_report_xlsx("26년 5월", {
        "summary_26년 5월": {(32, 2): "코멘트", (70, 2): "2026-05-01", (70, 3): 10, (70, 4): 1},
        "네이버SA_26년 5월": {(21, 2): "날짜", (21, 3): "노출", (21, 4): "클릭"},
    })
    assert isinstance(detect(content, "마케팅분석_26년5월.xlsx"), MonthlyTemplateFormat)


def test_detection_is_by_sheets_not_filename(make_weekly_raw_xlsx):
    """같은 .xlsx 로 두 양식이 다 올 수 있으므로 파일명은 믿지 않는다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1, clicks=1),
    ])
    # 월간 템플릿처럼 생긴 이름을 줘도 RAW 시트가 있으면 주간 리포트로 읽는다
    assert isinstance(detect(content, "마케팅분석_26년8월.xlsx"), WeeklyRawFormat)


def test_unknown_format_raises_with_sheet_names(make_report_xlsx):
    """어느 양식도 아니면, 무엇이 들어 있었는지 알려 준다 — 사용자가 고칠 수 있어야 한다."""
    content = make_report_xlsx("x", {"16일": {(1, 1): "키워드"}, "23일": {(1, 1): "키워드"}})
    with pytest.raises(ValueError) as exc:
        detect(content, "키워드 비교.xlsx")
    message = str(exc.value)
    assert "지원하는 리포트 양식이 아닙니다" in message
    assert "16일" in message and "23일" in message


def test_raw_sheet_without_required_headers_is_rejected(make_weekly_raw_xlsx):
    """시트 이름만 RAW 인 파일 — 내용 검사에서 걸러져야 한다."""
    content = make_weekly_raw_xlsx([["a", "b", "c"]], headers=["무관한", "헤더", "들"])
    with pytest.raises(ValueError, match="지원하는 리포트 양식이 아닙니다"):
        detect(content, "RAW만있는파일.xlsx")


def test_monthly_template_rejects_xlsb_extension(make_report_xlsx):
    """openpyxl 은 .xlsb 를 열지 못한다 — 양식을 고르는 단계에서 막아야 한다.

    막지 않으면 라우터가 monthly_template 을 골라 openpyxl 로 열다가 500 이 난다.
    """
    content = make_report_xlsx("26년 5월", {
        "summary_26년 5월": {(32, 2): "코멘트", (70, 2): "2026-05-01", (70, 3): 10, (70, 4): 1},
    })
    with pytest.raises(ValueError, match="지원하는 리포트 양식이 아닙니다"):
        detect(content, "실수로_확장자만_바꾼파일.xlsb")


def test_corrupt_file_raises_readable_error():
    with pytest.raises(ValueError, match="열지 못했습니다"):
        detect(b"not an excel file at all", "broken.xlsx")
