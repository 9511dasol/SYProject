"""내보내기 템플릿의 구조 불변식.

템플릿은 바이너리라 git diff 로 수식 변화를 볼 수 없다. 그래서 "집계 범위가 일별
구간 전체를 덮는가" 처럼 **눈으로 검토할 수 없는 성질**을 테스트로 고정한다.

여기 있는 규칙은 전부 실제로 깨져 있던 것을 고친 뒤 세운 것이다. DA 시트를 붙이고
내보낸 파일을 DB와 숫자로 대조하다가 찾았는데, **31일짜리 달에서만** 틀어져서
(짧은 달은 그 행이 비어 있어 티가 안 난다) 오래 살아남았다:

  - `네이버BS` G열(광고비 vat+)의 `=SUM(X:Y)` 가 49행까지만 있어 28~31일 광고비가
    시트 TOTAL 에 들어가지 않았다 — 월 약 160만 원이 내보낸 파일에서 사라졌다.
  - `네이버BS` X·Y열 TOTAL 이 `SUM(X23:X52)` 로 31일을 빼먹었다.
  - `파워컨텐츠` H·L·N·P열 TOTAL 이 `SUM(..23:..50)` 으로 29~31일의 광고비(markup)·
    회원가입·구매완료·구매매출을 빼먹었다.

복구 스크립트는 `scripts/repair_template_formula_ranges.py` 다.
"""

import io
import re

import openpyxl
import pandas as pd
import pytest

from app.services.excel_service import (
    DATA_ROW,
    PLACEHOLDER,
    SHEET_PREFIX,
    TEMPLATE_PATH,
    ExcelService,
)

TOTAL_ROW = 22
DATA_FIRST = DATA_ROW        # 23 = 그 달 1일
DATA_LAST = 53               # 31일 + 여유

_SUM_RANGE_RE = re.compile(r"SUM\(\$?[A-Z]{1,3}\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)\)")

needs_template = pytest.mark.skipif(not TEMPLATE_PATH.exists(), reason="report_template.xlsx 없음")


@pytest.fixture(scope="module")
def template():
    return openpyxl.load_workbook(TEMPLATE_PATH)


def _media_sheets(wb):
    return [wb[f"{prefix}_{PLACEHOLDER}"] for prefix in SHEET_PREFIX.values()]


def _is_formula(value) -> bool:
    return isinstance(value, str) and value.startswith("=")


@needs_template
def test_total_row_ranges_cover_the_whole_daily_block(template):
    """TOTAL(22행)의 SUM 범위가 일별 구간 끝(53행)까지 가야 한다.

    끝을 짧게 잡으면 그 달 마지막 며칠이 합계에서 조용히 빠진다 — 30·31일이 있는
    달에서만 틀어지므로 눈으로는 거의 안 걸린다.
    """
    offenders = []
    for ws in _media_sheets(template):
        for col in range(3, ws.max_column + 1):
            formula = ws.cell(TOTAL_ROW, col).value
            if not _is_formula(formula):
                continue
            for start, col_letter, end in _SUM_RANGE_RE.findall(formula):
                if int(start) == DATA_FIRST and int(end) < DATA_LAST:
                    offenders.append(f"{ws.title} {col_letter}열: {formula}")
    assert not offenders, "일별 구간을 끝까지 더하지 않는 TOTAL 수식:\n" + "\n".join(offenders)


@needs_template
def test_daily_block_has_no_formula_gaps(template):
    """일별 구간에서 수식이 중간부터 사라지는 컬럼이 없어야 한다.

    처음부터 끝까지 비어 있는 컬럼은 원시값이 들어갈 자리라 정상이다. 문제는 "앞쪽
    행에는 수식이 있는데 뒤쪽 몇 행만 비어 있는" 경우다 — 그 며칠이 계산에서 빠진다.
    """
    offenders = []
    for ws in _media_sheets(template):
        for col in range(3, ws.max_column + 1):
            rows = range(DATA_FIRST, DATA_LAST + 1)
            has = {r: _is_formula(ws.cell(r, col).value) for r in rows}
            if not any(has.values()) or all(has.values()):
                continue
            missing = [r for r in rows if not has[r]]
            offenders.append(f"{ws.title} {col}열: {missing} 행에 수식 없음")
    assert not offenders, "일별 구간에 구멍이 있는 컬럼:\n" + "\n".join(offenders)


@needs_template
def test_thirty_one_day_month_fills_every_daily_row():
    """31일 달을 내보내면 마지막 행(53)까지 값이 들어가야 한다.

    네이버BS 는 광고비를 X열(브검PC)에 넣고 G열이 `=SUM(X:Y)` 로 집계한다. 그 G열
    수식이 50~53행에 없어서 28~31일이 사라졌던 것이 이 테스트의 발단이다.
    """
    frame = pd.DataFrame([
        {
            "date": f"2026-07-{day:02d}",
            "impressions": 100, "clicks": 10, "cost": 1000.0,
            "total_conv": 3, "signup": 1.0, "purchase": 1.0,
            "revenue": 5000.0, "apply": 1.0,
        }
        for day in range(1, 32)
    ])
    raw = ExcelService().fill_template(
        {label: frame.copy() for label in SHEET_PREFIX}, "26년 7월", 2026, 7
    )
    wb = openpyxl.load_workbook(io.BytesIO(raw))

    bs = wb["네이버BS_26년 7월"]
    for row in range(DATA_FIRST, DATA_FIRST + 31):
        assert bs.cell(row, 24).value == 1000.0, f"브검PC {row}행 비어 있음"
        assert _is_formula(bs.cell(row, 7).value), f"광고비 집계 수식 {row}행 없음"

    # 31일(53행)까지 TOTAL 범위에 들어가는지 — 수식 문자열로 확인한다(openpyxl 은
    # 계산하지 않으므로 값 비교는 할 수 없다).
    assert bs.cell(TOTAL_ROW, 24).value == f"=SUM(X{DATA_FIRST}:X{DATA_LAST})"
