"""테스트 공통 픽스처.

외부 의존(DB/LLM/메일/스토리지) 없이 순수 로직·엑셀 파싱만 검증하는 1단계 테스트용.
엑셀 픽스처는 바이너리 파일을 커밋하지 않고 openpyxl/pandas로 즉석 생성한다
(포맷이 바뀌면 여기만 고치면 되고, git diff 도 읽을 수 있다)."""

import io

import openpyxl
import pandas as pd
import pytest


def _df_to_xlsx_bytes(sheets: dict[str, pd.DataFrame]) -> bytes:
    """{시트명: DataFrame(header 없이 raw 셀 배치)} → xlsx 바이트."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for name, df in sheets.items():
            df.to_excel(writer, sheet_name=name, header=False, index=False)
    return buf.getvalue()


@pytest.fixture
def make_keyword_xlsx():
    """keyword_compare 용 xlsx 생성기. rows 는 header 없는 2D 리스트."""
    def _make(sheets: dict[str, list[list]]) -> bytes:
        return _df_to_xlsx_bytes({n: pd.DataFrame(rows) for n, rows in sheets.items()})
    return _make


#: 주간 리포트 RAW 시트의 헤더 — app/services/weekly_raw_reader_service.RAW_COLUMNS 와
#: 같은 이름을 쓰되, 실제 파일처럼 쓰지 않는 컬럼도 섞고 개행도 넣어 둔다. 리더가 좌표가
#: 아니라 헤더 이름으로 컬럼을 찾는다는 것을 테스트가 실제로 확인하게 하기 위한 것이다.
WEEKLY_RAW_HEADERS: list[str] = [
    "날짜", "주차", "요일", "년월", "기간구분", "대행사구분",
    "캠페인 유형\n(매체)", "캠페인명\n(매체)", "그룹\n(매체)", "기기\n(매체)",
    "매체/플랫폼", "광고유형", "기기", "이벤트명", "타겟구분",
    "노출", "클릭", "광고비(vat+)", "광고비(vat,markup)",
    "총전환수", "총전환수\n(신청제외)",
    "회원가입수", "구매완료수", "구매매출액", "설명회신청",
]


def weekly_raw_row(
    date, platform: str, ad_type: str, *,
    impressions=0, clicks=0, cost=0, markup_cost=0,
    conversions=0, signup=0, purchase=0, revenue=0, apply=0,
) -> list:
    """RAW 시트 한 행. 지표만 이름으로 넘기면 나머지 메타 컬럼은 더미로 채운다."""
    return [
        date, "26년 1월1주(1/1~1/7)", "월", "26년 01월", "26년 01월", "트리플하이엠",
        "-", "-", "-", "-",
        platform, ad_type, "PC", ad_type, "-",
        impressions, clicks, cost, markup_cost,
        conversions, conversions,
        signup, purchase, revenue, apply,
    ]


@pytest.fixture
def make_weekly_raw_xlsx():
    """주간 리포트(RAW 탭) 양식 생성기.

    실제 파일은 .xlsb 지만 calamine 은 xlsx 도 같은 방식으로 읽고, 양식 판별은
    확장자가 아니라 시트 구성으로 하므로 테스트는 xlsx 로 만든다 — 바이너리 픽스처를
    커밋하지 않아도 되고 git diff 로 읽힌다.

    rows: RAW 시트의 데이터 행들 (weekly_raw_row 로 만든다)
    review: review 시트에 넣을 {(row, col): value} — 생략하면 review 시트 없음
    """
    def _make(rows: list[list], review: dict[tuple[int, int], object] | None = None,
              headers: list[str] | None = None) -> bytes:
        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        ws = wb.create_sheet(title="RAW")
        ws.append(list(headers if headers is not None else WEEKLY_RAW_HEADERS))
        for row in rows:
            ws.append(row)
        if review is not None:
            rv = wb.create_sheet(title="review")
            for (r, c), value in review.items():
                rv.cell(row=r, column=c, value=value)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
    return _make


@pytest.fixture
def make_report_xlsx():
    """excel_reader.read_report 용 최소 summary 워크북 생성기.

    셀 좌표를 직접 채워 실제 리포트 파일 구조를 최소로 재현한다.
    cells: {시트명: {(row, col): value}}
    """
    def _make(period: str, cells: dict[str, dict[tuple[int, int], object]]) -> bytes:
        wb = openpyxl.Workbook()
        # 기본 생성 시트 제거
        wb.remove(wb.active)
        for sheet_name, cell_map in cells.items():
            ws = wb.create_sheet(title=sheet_name)
            for (row, col), value in cell_map.items():
                ws.cell(row=row, column=col, value=value)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
    return _make
