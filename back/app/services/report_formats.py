"""업로드 리포트 **양식 레지스트리** — 파일을 보고 어느 리더로 읽을지 고른다.

예전에는 리포트 양식이 하나뿐이라 라우터가 `ExcelReaderService()` 를 직접 불렀다.
대행사가 보내 주는 주간 리포트(`Weekly Report_*.xlsb`)가 생기면서 양식이 둘이 됐고,
둘은 확장자(.xlsx vs .xlsb)·시트 구성·데이터 모양이 전부 다르다. 양식마다 라우터에
`if` 를 늘리는 대신 여기에 등록해 두고 라우터는 `detect()` 한 번만 부른다.

**새 양식을 추가하는 방법**

1. 리더 클래스를 만든다. 아래 `ReportFormat` 프로토콜 네 가지를 갖추면 된다 —
   `matches` · `list_period_summaries` · `read_reports` · `to_db_dataframe`.
2. `FORMATS` 에 한 줄 추가한다.

그 외에는 손댈 곳이 없다. 업로드 모달·저장·되돌리기는 모두 이 프로토콜만 보고 돌아간다.
"""

import io
import logging
import os
from typing import Protocol, runtime_checkable

from app.services.excel_reader_service import ExcelReaderService
from app.services.weekly_raw_reader_service import WeeklyRawReaderService

logger = logging.getLogger(__name__)


@runtime_checkable
class ReportFormat(Protocol):
    """업로드 리포트 양식 하나가 갖춰야 할 것."""

    #: 로그·오류 메시지용 식별자
    name: str
    #: 사람이 읽는 양식 이름 — 업로드 화면에 그대로 보인다
    label: str

    def list_period_summaries(self, content: bytes) -> list[dict]:
        """[{period, days, comment}] — 업로드 모달의 기간 선택 목록."""
        ...

    def read_reports(self, content: bytes, periods: list[str] | None = None) -> list[dict]:
        """기간별 리포트 dict (schemas/excel_report_schema.ExcelReport 모양)."""
        ...

    def to_db_dataframe(self, report: dict):
        """리포트 dict → DB 저장용 DataFrame."""
        ...


class MonthlyTemplateFormat(ExcelReaderService):
    """기존 월간 템플릿 — 기간마다 `summary_*` · `<매체>_*` 시트가 한 벌씩.

    파싱 로직은 `ExcelReaderService` 그대로 두고, 레지스트리가 요구하는 식별자와
    판별 함수만 얹는다.
    """

    name = "monthly_template"
    label = "월간 리포트 템플릿 (summary 시트)"
    # openpyxl 로 읽으므로 바이너리 포맷(.xlsb)은 지원하지 않는다.
    extensions = frozenset({".xlsx", ".xlsm"})

    @classmethod
    def matches_sheets(cls, sheet_names: list[str]) -> bool:
        return any(s.startswith("summary_") for s in sheet_names)


class WeeklyRawFormat(WeeklyRawReaderService):
    """대행사 주간 리포트 — `RAW` 시트 한 장에 전 기간이 tidy long format 으로."""

    name = "weekly_raw"
    label = "주간 리포트 (RAW 탭)"
    extensions = frozenset({".xlsb", ".xlsx", ".xlsm"})

    @classmethod
    def matches_sheets(cls, sheet_names: list[str]) -> bool:
        from app.services.weekly_raw_reader_service import SHEET_RAW

        return SHEET_RAW in sheet_names


#: 등록된 양식. 앞에 있는 것부터 판별한다 — 더 구체적인 양식을 앞에 둔다.
FORMATS: tuple[type, ...] = (WeeklyRawFormat, MonthlyTemplateFormat)

#: 업로드가 허용하는 확장자 — 등록된 양식들이 읽을 수 있는 것의 합집합.
SUPPORTED_EXTENSIONS: frozenset[str] = frozenset(
    ext for fmt in FORMATS for ext in fmt.extensions
)


def _sheet_names(content: bytes) -> list[str]:
    """시트 이름만 싸게 읽는다.

    calamine 은 .xlsx/.xlsm/.xlsb 를 모두 열고, 시트 이름은 통합 문서 메타만 읽으면
    나오므로 86MB 파일에서도 즉시 끝난다. openpyxl 로 열어서 판별하면 양식을 고르기도
    전에 전체 파싱 비용을 치르게 된다.
    """
    from python_calamine import CalamineWorkbook

    return list(CalamineWorkbook.from_filelike(io.BytesIO(content)).sheet_names)


def detect(content: bytes, filename: str = "") -> ReportFormat:
    """파일에 맞는 양식 리더를 돌려준다. 못 찾으면 ValueError.

    판별은 **시트 구성**으로 한다 — 확장자는 거르는 용도로만 쓴다. 같은 `.xlsx` 로
    두 양식이 다 올 수 있기 때문이다.
    """
    ext = os.path.splitext(filename.lower())[1]
    try:
        sheets = _sheet_names(content)
    except Exception as exc:
        raise ValueError(f"엑셀 파일을 열지 못했습니다: {exc}") from exc

    for fmt in FORMATS:
        if ext and ext not in fmt.extensions:
            continue
        if not fmt.matches_sheets(sheets):
            continue
        # 시트 이름이 맞아도 내용이 양식과 다를 수 있다(헤더 누락 등).
        # 양식이 자체 검사(matches)를 제공하면 여기서 한 번 더 거른다.
        checker = getattr(fmt, "matches", None)
        if callable(checker) and not checker(content):
            logger.info("%s: 시트는 맞지만 내용 검사를 통과하지 못했습니다", fmt.name)
            continue
        logger.info("업로드 양식 판별: %s (%s)", fmt.name, filename or "-")
        return fmt()  # type: ignore[return-value]

    known = ", ".join(f.label for f in FORMATS)
    raise ValueError(
        "지원하는 리포트 양식이 아닙니다. "
        f"시트 구성을 확인해 주세요 (등록된 양식: {known}). "
        f"파일에 들어 있는 시트: {', '.join(sheets[:10])}"
        + (" …" if len(sheets) > 10 else "")
    )
