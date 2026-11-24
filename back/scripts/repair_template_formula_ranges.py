"""report_template.xlsx 의 **끊긴 집계 범위**를 복구한다.

DA 시트를 붙인 뒤 내보낸 파일을 DB와 숫자로 대조하다가 찾은 기존 버그다. 31일짜리
달에서만 틀어져서(짧은 달은 빈 칸이라 티가 나지 않는다) 오래 살아남았다.

찾은 것 두 종류:

**1. 일별 구간(23~53행)에서 수식이 중간에 끊긴 컬럼**
   - `네이버BS` G열(광고비 vat+) = `=SUM(X:Y)` 가 **49행까지만** 있다. 50~53행은 빈칸이라
     28~31일 광고비가 시트 TOTAL(=SUM(G23:G53))에 들어가지 않는다. 월 약 160만 원이
     내보낸 파일에서 사라진다.
   - `파워컨텐츠` M·O·Q·R열(회원가입률·결제완료율·구매수익률·구매단가) = 50행까지만.
     파생 비율이라 합계를 깨뜨리지는 않지만 29~31일이 빈칸으로 보인다.

**2. TOTAL(22행) 의 SUM 범위가 53행에 못 미치는 컬럼**
   - `네이버BS` X·Y열(브검PC·브검MO) = `SUM(X23:X52)` → **31일 누락**. 광고비 원시값이
     X열에 들어가므로 데이터 손실이다.
   - `파워컨텐츠` H·L·N·P·R열(광고비 markup·회원가입·구매완료·구매매출·구매단가)
     = `SUM(..23:..50)` → **29~31일 누락**. 회원가입·구매완료·구매매출이 TOTAL 에 안 들어가면
     summary 합계까지 그대로 적게 나온다.
   - `카카오SA` Q열(구매단가) = `SUM(Q23:Q50)` → 파생 지표라 영향은 표시뿐이다.

고치는 방식은 둘 다 기계적이다 — 끊긴 컬럼은 **마지막으로 남아 있는 수식을 행만 바꿔**
아래로 이어 붙이고, 짧은 SUM 범위는 끝 행을 53으로 늘린다. 레이아웃은 건드리지 않는다.

**멱등**이다. 이미 복구된 템플릿에 돌리면 아무것도 바꾸지 않는다.

    python -m scripts.repair_template_formula_ranges            # 제자리에서 복구
    python -m scripts.repair_template_formula_ranges out.xlsx   # 다른 경로로

템플릿 스크립트 실행 순서 (고객사 원본으로 템플릿을 다시 만들 때):
    1. python -m scripts.reset_report_template
    2. python -m scripts.add_da_sheets_to_template
    3. python -m scripts.repair_template_formula_ranges
"""

import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.cell.cell import MergedCell
from openpyxl.utils import get_column_letter

_ASSETS = Path(__file__).resolve().parent.parent / "app" / "assets"
TEMPLATE_PATH = _ASSETS / "report_template.xlsx"

SUMMARY_PREFIX = "summary"

TOTAL_ROW = 22        # 매체 시트 TOTAL
DATA_FIRST = 23       # 일별 첫 행 (= 1일)
DATA_LAST = 53        # 31일 + 여유

_SUM_RANGE_RE = re.compile(r"SUM\((\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)\)")
_ROW_REF_RE = re.compile(r"(\$?)([A-Z]{1,3})(\$?)(\d+)")


def _is_formula(value) -> bool:
    return isinstance(value, str) and value.startswith("=")


def _put(ws, row: int, col: int, value) -> None:
    cell = ws.cell(row, col)
    if not isinstance(cell, MergedCell):
        cell.value = value


def _shift_rows(formula: str, src_row: int, dst_row: int) -> str:
    """상대 참조인 src_row 만 dst_row 로 바꾼다(절대 행 `$3` 은 그대로)."""
    def _sub(m: re.Match) -> str:
        col_abs, col, row_abs, row = m.groups()
        if row_abs or int(row) != src_row:
            return m.group(0)
        return f"{col_abs}{col}{row_abs}{dst_row}"

    return _ROW_REF_RE.sub(_sub, formula)


def _fill_daily_gaps(ws) -> list[str]:
    """일별 구간에서 수식이 중간에 끊긴 컬럼을 마지막 수식으로 이어 붙인다.

    "일부 행에는 수식이 있고 뒤쪽 행에는 없다"는 상태만 고친다. 처음부터 끝까지
    비어 있는 컬럼은 **원시값이 들어갈 자리**이므로 건드리지 않는다.
    """
    fixed = []
    for col in range(3, ws.max_column + 1):
        rows = range(DATA_FIRST, DATA_LAST + 1)
        has = {r: _is_formula(ws.cell(r, col).value) for r in rows}
        if not any(has.values()) or all(has.values()):
            continue

        last_with = max(r for r in rows if has[r])
        # 끊긴 자리가 마지막 수식 "뒤"에만 있어야 한다. 중간이 비어 있으면 의도된
        # 구조일 수 있으니 손대지 않고 넘긴다.
        if any(has[r] for r in rows if r > last_with):
            continue
        template = ws.cell(last_with, col).value

        for r in rows:
            if r <= last_with or has[r]:
                continue
            # 이미 원시값이 들어 있으면(손입력 상수) 덮어쓰지 않는다
            if ws.cell(r, col).value is not None:
                continue
            _put(ws, r, col, _shift_rows(template, last_with, r))
        fixed.append(f"{get_column_letter(col)}({last_with + 1}~{DATA_LAST}행)")
    return fixed


def _extend_total_ranges(ws) -> list[str]:
    """TOTAL(22행)의 `SUM(X23:X52)` 처럼 짧은 범위를 53행까지 늘린다."""
    fixed = []
    for col in range(3, ws.max_column + 1):
        formula = ws.cell(TOTAL_ROW, col).value
        if not _is_formula(formula):
            continue

        def _sub(m: re.Match) -> str:
            c1, r1, c2, r2 = m.groups()
            # 일별 구간을 가리키면서 끝이 53보다 앞인 범위만 늘린다
            if int(r1) != DATA_FIRST or int(r2) >= DATA_LAST:
                return m.group(0)
            return f"SUM({c1}{r1}:{c2}{DATA_LAST})"

        patched = _SUM_RANGE_RE.sub(_sub, formula)
        if patched != formula:
            ws.cell(TOTAL_ROW, col).value = patched
            fixed.append(f"{get_column_letter(col)}: {formula} → {patched}")
    return fixed


def repair(src: Path, dst: Path) -> None:
    wb = openpyxl.load_workbook(src, keep_links=True, keep_vba=False)

    total_changes = 0
    for ws in wb.worksheets:
        if ws.title.startswith(SUMMARY_PREFIX):
            continue
        gaps = _fill_daily_gaps(ws)
        totals = _extend_total_ranges(ws)
        if not gaps and not totals:
            continue
        total_changes += len(gaps) + len(totals)
        print(f"[{ws.title}]")
        for item in gaps:
            print(f"   일별 수식 이어 붙임: {item}")
        for item in totals:
            print(f"   TOTAL 범위 연장: {item}")

    if total_changes == 0:
        print("고칠 것이 없습니다 (이미 복구됨).")

    wb._external_links = []
    wb.active = 0
    wb.save(dst)
    print(f"→ {dst}")


def main(argv: list[str]) -> None:
    repair(TEMPLATE_PATH, Path(argv[1]).resolve() if len(argv) > 1 else TEMPLATE_PATH)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
