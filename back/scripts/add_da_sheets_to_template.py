"""report_template.xlsx 에 DA 매체 시트를 추가하고 summary 합계를 다시 잇는다.

대행사 주간 리포트 양식을 받으면서 DB에 DA(디스플레이·배너·영상) 매체 3종이 생겼는데
(`구글DA`·`카카오DA`·`기타DA`), 내보내기 템플릿에는 그 시트가 없어 export 가 DA를
**조용히 빼고** 파일을 만들었다. 크래시는 없지만 화면 TOTAL 과 내보낸 파일 숫자가
달라진다 — 최근 월 기준 광고비 약 25%, 매출 약 50% 차이다.

이 스크립트는 **멱등**이다. 이미 DA 시트가 있으면 건너뛰므로 여러 번 돌려도 안전하다.

    python -m scripts.add_da_sheets_to_template            # 템플릿을 제자리에서 갱신
    python -m scripts.add_da_sheets_to_template out.xlsx   # 결과를 다른 경로로

되돌리려면 git 으로 report_template.xlsx 를 복원한다.

**왜 네이버SA 시트를 복사하는가**
DA 는 노출·클릭·광고비·회원가입·구매완료·구매매출·설명회신청 7개 RAW 지표를 쓰는데,
네이버SA 시트의 레이아웃이 정확히 그 모양이다(21컬럼). 특히 총전환수 칸이
`=SUM(N,P,U)` = 회원가입+구매완료+설명회신청 인데, 실측 데이터에서 DA 의 총전환수가
이 합과 **정확히 일치**한다(2026-11: 320+1,427+210 = 1,957). 그래서 레이아웃을 그대로
쓰면 수식이 DB 값을 그대로 재현한다. `excel_service._SHEET_COLS` 도 같은 이유로
DA 3종에 `_NAVER_SA_COLS` 를 그대로 쓴다.

**예산 구간(21~30행)을 다루는 방식**
예산표에 DA 행을 끼워 넣으려면 행을 삽입해야 하는데, 그러면 코멘트 병합(B32:W65)과
일별 구간 첫 행(70)이 밀린다. 그 좌표는 쓰는 쪽(excel_service)·읽는 쪽
(excel_reader_service)·템플릿 생성기(reset_report_template) 세 곳에 상수로 박혀 있고,
읽는 쪽은 **고객사가 보내 주는 기존 레이아웃 파일**도 같은 좌표로 파싱한다. 그래서
행은 움직이지 않고, 원래 비어 있던 29·30행을 쓴다.

29행에는 원래 "예산표 합계 == 상단 TOTAL" 을 확인하는 TRUE/FALSE 검산식이 있었다.
그런데 16칸 중 5칸이 28행(5매체 합계) 대신 **26행(SA+BS 합계)** 을 가리키는 오타라서,
네이버PSA 에 실적이 있는 달이면 DA 와 무관하게 이미 FALSE 였다. 라벨도 없는 칸이고
어떤 코드도 읽지 않으므로, 늘 FALSE 인 검산식을 남기는 대신 실제로 쓸모 있는 값
(DA 합계·전체 합계)으로 바꾼다. 같은 불변식은 `tests/test_excel_export_da.py` 가
검증한다 — 시트 안의 수식보다 테스트가 지킬 자리다.
"""

import re
import sys
from copy import copy
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

_ASSETS = Path(__file__).resolve().parent.parent / "app" / "assets"
TEMPLATE_PATH = _ASSETS / "report_template.xlsx"

PLACEHOLDER = "PERIOD"
SUMMARY_SHEET = f"summary_{PLACEHOLDER}"

#: 레이아웃 원본 — DA 와 컬럼 구성이 같다 (위 모듈 docstring 참고)
SOURCE_SHEET = f"네이버SA_{PLACEHOLDER}"

#: (DB 매체 레이블, 시트 20행 섹션 제목). 제목은 기존 시트 표기법("■ naver SA")에 맞춘다.
DA_SHEETS: list[tuple[str, str]] = [
    ("구글DA", "■ google DA"),
    ("카카오DA", "■ kakao DA"),
    ("기타DA", "■ other DA"),
]

# ── summary 교차시트 합계를 고쳐야 하는 행 ────────────────────────────────────────
# 7행 전년동월 · 9행 당월 · 70~100행 일별. 8행(전월)은 수식이 아니라 DB 값을 직접 써
# 넣는 행이고, 12·13·14행(전주·금주·WoW)은 일별 구간을 SUMIF 로 다시 집계하므로
# 70~100행만 고치면 자동으로 따라온다.
SUMMARY_SUM_ROWS: list[int] = [7, 9, *range(70, 101)]

# ── 예산 구간 ──────────────────────────────────────────────────────────────────
BUDGET_MEDIA_ROW = 21     # naver_SA 행 — 파생 수식의 본으로 쓴다
BUDGET_TOTAL_ROW = 28     # 기존 5매체 합계 ("TOAL")
BUDGET_DA_ROW = 29        # 새로 쓰는 DA 합계
BUDGET_GRAND_ROW = 30     # 새로 쓰는 전체 합계
BUDGET_LABEL_COL = 3

#: summary 합계에서 **파워컨텐츠(네이버PSA)가 빠져 있던** 칸 → 파워컨텐츠 시트의 컬럼.
#:
#: DA 를 붙이려고 이 수식들을 훑다가 찾은 기존 버그다. 당월·전년동월·일별 합계에서
#: 광고비(vat+)·총전환수·회원가입·구매완료·구매매출 다섯 칸이 파워컨텐츠를 참조하지
#: 않아, 내보낸 리포트의 상단 합계가 네이버PSA 만큼(월 360만~490만 원) 적게 나왔다.
#: DA 만 더하고 이걸 두면 export 와 화면 숫자는 여전히 어긋나므로 같이 고친다.
#:
#: 설명회신청(c22)에 카카오SA·파워컨텐츠가 없는 것은 버그가 아니다 — 두 시트에는
#: 그 지표 컬럼 자체가 없다(카카오SA 16컬럼, 파워컨텐츠 17컬럼).
MISSING_PSA_REFS: dict[int, str] = {
    7: "G",    # 광고비(vat+)
    9: "I",    # 총전환수
    15: "L",   # 회원가입
    17: "N",   # 구매완료
    19: "P",   # 구매매출
}

PSA_SHEET = f"파워컨텐츠_{PLACEHOLDER}"

#: 예산 구간에서 매체 시트를 직접 가리키는 컬럼 → 그 시트의 컬럼 문자.
#: 나머지 칸은 같은 행 안에서 계산되는 파생 지표라 행 번호만 옮기면 된다.
BUDGET_SOURCE_COLS: dict[int, str] = {
    5: "G",    # 누적 광고비
    10: "C",   # 노출
    11: "D",   # 클릭
    12: "G",   # 광고비(vat포함)
    13: "H",   # 총전환수
    16: "K",   # 총전환수(신청제외)
    19: "N",   # 회원가입
    21: "P",   # 구매완료
    23: "R",   # 구매매출
}

#: 전체 합계 행에서 "28행 + 29행" 으로 더하면 되는 컬럼
BUDGET_ADDITIVE_COLS: tuple[int, ...] = (4, 5, 8, 9, 10, 11, 12, 13, 16, 19, 21, 23)

_ROW_REF_RE = re.compile(r"(\$?)([A-Z]{1,3})(\$?)(\d+)")


def _is_formula(value) -> bool:
    return isinstance(value, str) and value.startswith("=")


def _shift_rows(formula: str, src_row: int, dst_row: int) -> str:
    """수식에서 **상대 참조**인 src_row 만 dst_row 로 바꾼다.

    `$E$3` 처럼 행이 절대 참조인 것은 건드리지 않는다 — 기준일·일수 같은 고정 칸이다.
    """
    def _sub(m: re.Match) -> str:
        col_abs, col, row_abs, row = m.groups()
        if row_abs or int(row) != src_row:
            return m.group(0)
        return f"{col_abs}{col}{row_abs}{dst_row}"

    return _ROW_REF_RE.sub(_sub, formula)


def _da_sheet_names() -> list[str]:
    return [f"{label}_{PLACEHOLDER}" for label, _ in DA_SHEETS]


def _da_sum(col: str, row: int) -> str:
    """3개 DA 시트의 같은 칸을 더하는 수식."""
    refs = ",".join(f"'{name}'!{col}{row}" for name in _da_sheet_names())
    return f"=SUM({refs})"


# ── 1단계: DA 시트 만들기 ───────────────────────────────────────────────────────

def _add_da_sheets(wb) -> list[str]:
    source = wb[SOURCE_SHEET]
    added = []
    for label, title in DA_SHEETS:
        name = f"{label}_{PLACEHOLDER}"
        if name in wb.sheetnames:
            continue
        ws = wb.copy_worksheet(source)
        ws.title = name
        ws.cell(20, 2).value = title

        # copy_worksheet 는 조건부 서식을 옮기지 않는다 — 손으로 복사한다.
        for rng in source.conditional_formatting:
            for rule in rng.rules:
                ws.conditional_formatting.add(str(rng.sqref), copy(rule))

        added.append(name)
    return added


# ── 2단계: summary 교차시트 합계에 DA 더하기 ────────────────────────────────────

def _extend_summary_sums(wb) -> int:
    """`'네이버SA_PERIOD'!C10` 뒤에 DA 3시트의 같은 칸을 끼워 넣는다.

    SUM 의 닫는 괄호 앞이 아니라 **네이버SA 참조 바로 뒤**에 넣는 이유는, 원본 수식에
    `…,'구글SA_PERIOD'!G10,)` 처럼 인자 없는 쉼표가 붙어 있는 칸이 있어서다. 괄호 앞에
    붙이면 그 쉼표와 겹쳐 수식이 깨진다.

    DA 시트 레이아웃이 네이버SA 와 같으므로 네이버SA 가 쓰는 컬럼 문자를 그대로 쓴다.
    """
    ws = wb[SUMMARY_SHEET]
    patched = 0
    for row in SUMMARY_SUM_ROWS:
        for col in range(1, ws.max_column + 1):
            cell = ws.cell(row, col)
            formula = cell.value
            if not _is_formula(formula) or f"'{SOURCE_SHEET}'!" not in formula:
                continue
            if f"'{_da_sheet_names()[0]}'!" in formula:
                continue  # 이미 적용됨 (멱등)

            match = re.search(rf"'{SOURCE_SHEET}'!(\$?[A-Z]{{1,3}}\$?\d+)", formula)
            if not match:
                continue
            ref = match.group(1)
            extra = ",".join(f"'{name}'!{ref}" for name in _da_sheet_names())
            cell.value = formula.replace(match.group(0), f"{match.group(0)},{extra}", 1)
            patched += 1
    return patched


def _fix_missing_psa_refs(wb) -> int:
    """summary 합계에서 빠져 있던 파워컨텐츠(네이버PSA) 참조를 끼워 넣는다.

    DA 와 같은 행들을 다루므로 같은 방식으로 네이버SA 참조 뒤에 붙인다. 파워컨텐츠는
    컬럼 구성이 네이버SA 와 달라(17컬럼) 지표별 컬럼을 MISSING_PSA_REFS 로 따로 준다.
    행 번호는 네이버SA 참조에서 그대로 가져온다 — 같은 합계 안이면 모든 매체가 같은
    행을 가리킨다(당월=10, 전년동월=8, 일별=23~53).
    """
    ws = wb[SUMMARY_SHEET]
    patched = 0
    for row in SUMMARY_SUM_ROWS:
        for col, psa_col in MISSING_PSA_REFS.items():
            cell = ws.cell(row, col)
            formula = cell.value
            if not _is_formula(formula) or f"'{SOURCE_SHEET}'!" not in formula:
                continue
            if f"'{PSA_SHEET}'!" in formula:
                continue  # 이미 참조함 (멱등 / 원래 정상인 칸)

            match = re.search(rf"'{SOURCE_SHEET}'!\$?[A-Z]{{1,3}}\$?(\d+)", formula)
            if not match:
                continue
            media_row = match.group(1)
            patched_formula = formula.replace(
                match.group(0), f"{match.group(0)},'{PSA_SHEET}'!{psa_col}{media_row}", 1
            )
            # 광고비 칸은 원본이 `…,'구글SA_PERIOD'!G10,)` 였다 — SUM 의 마지막 인자가
            # 비어 있다. 작성자가 파워컨텐츠를 넣으려고 쉼표까지 찍고 채우지 않은 자리로
            # 보인다(결과는 0 으로 더해져 티가 나지 않았다). 그 자리를 채웠으니 남은
            # 빈 인자는 지운다.
            #
            # 주의: 이 파일의 `=IFERROR(D7/C7,)` 꼴은 **의도된 관용구**다(오류일 때 빈칸).
            # 589칸이 그 모양이므로 `,)` 를 일괄로 건드리면 안 된다 — 여기서는 네이버SA
            # 참조를 가진 SUM 수식만 보고 있어서 IFERROR 칸에는 닿지 않는다.
            cell.value = re.sub(r",\s*\)$", ")", patched_formula)
            patched += 1
    return patched


# ── 3단계: 예산 구간에 DA 합계·전체 합계 행 세우기 ───────────────────────────────

def _build_budget_rows(wb) -> None:
    ws = wb[SUMMARY_SHEET]

    # 28행 라벨: "TOAL" 은 이제 DA를 포함하지 않는 합계다 — 이름으로 분명히 해 둔다.
    ws.cell(BUDGET_TOTAL_ROW, BUDGET_LABEL_COL).value = "SA+BS+PSA total"

    media_row = BUDGET_MEDIA_ROW
    for col in range(1, ws.max_column + 1):
        letter = get_column_letter(col)
        template_cell = ws.cell(media_row, col)
        total_cell = ws.cell(BUDGET_TOTAL_ROW, col)

        # --- 29행: DA 합계 ---
        da_cell = ws.cell(BUDGET_DA_ROW, col)
        da_cell.style = template_cell.style
        if col == BUDGET_LABEL_COL:
            da_cell.value = "DA total"
        elif col in BUDGET_SOURCE_COLS:
            da_cell.value = _da_sum(BUDGET_SOURCE_COLS[col], 22)
        elif _is_formula(template_cell.value):
            da_cell.value = _shift_rows(template_cell.value, media_row, BUDGET_DA_ROW)
        elif col == 4:  # 총합(vat,markup) = 예산. DA 예산은 DB에 없다.
            da_cell.value = 0
        else:
            da_cell.value = None

        # --- 30행: 전체 합계 (28행 + 29행) ---
        grand_cell = ws.cell(BUDGET_GRAND_ROW, col)
        grand_cell.style = total_cell.style
        if col == BUDGET_LABEL_COL:
            grand_cell.value = "TOTAL (SA+DA)"
        elif col in BUDGET_ADDITIVE_COLS:
            grand_cell.value = f"=SUM({letter}{BUDGET_TOTAL_ROW},{letter}{BUDGET_DA_ROW})"
        elif _is_formula(total_cell.value):
            grand_cell.value = _shift_rows(total_cell.value, BUDGET_TOTAL_ROW, BUDGET_GRAND_ROW)
        else:
            grand_cell.value = None


# ── 4단계: 섹션 제목 ───────────────────────────────────────────────────────────

def _relabel_total_sections(wb) -> None:
    """"■ SA TOTAL" 은 이제 DA까지 포함한다 — 라벨을 실제 내용에 맞춘다.

    코드가 이 문자열을 보고 파싱하는 곳은 없다(리더는 행 번호로 읽는다).
    """
    ws = wb[SUMMARY_SHEET]
    for row in (5, 67):
        cell = ws.cell(row, 2)
        if isinstance(cell.value, str) and "SA TOTAL" in cell.value:
            cell.value = "■ TOTAL (SA+BS+PSA+DA)"


def add_da_sheets(src: Path, dst: Path) -> None:
    wb = openpyxl.load_workbook(src, keep_links=True, keep_vba=False)
    if SUMMARY_SHEET not in wb.sheetnames:
        raise SystemExit(
            f"{SUMMARY_SHEET} 시트를 찾을 수 없습니다. 먼저 reset_report_template 로 "
            f"기간 토큰을 {PLACEHOLDER} 로 바꿔 주세요: {wb.sheetnames}"
        )
    if SOURCE_SHEET not in wb.sheetnames:
        raise SystemExit(f"{SOURCE_SHEET} 시트를 찾을 수 없습니다: {wb.sheetnames}")

    added = _add_da_sheets(wb)
    patched = _extend_summary_sums(wb)
    psa_fixed = _fix_missing_psa_refs(wb)
    _build_budget_rows(wb)
    _relabel_total_sections(wb)

    wb._external_links = []
    wb.active = 0
    wb.save(dst)

    print(f"DA 시트 추가: {added or '(이미 있음)'}")
    print(f"summary 교차시트 합계 수식 {patched}칸에 DA 반영")
    print(f"빠져 있던 파워컨텐츠(네이버PSA) 참조 {psa_fixed}칸 복구")
    print(f"예산 구간 {BUDGET_DA_ROW}행=DA total, {BUDGET_GRAND_ROW}행=TOTAL (SA+DA) 작성")
    print(f"→ {dst} (시트 {len(wb.sheetnames)}개)")


def main(argv: list[str]) -> None:
    add_da_sheets(TEMPLATE_PATH, Path(argv[1]).resolve() if len(argv) > 1 else TEMPLATE_PATH)


if __name__ == "__main__":
    main(sys.argv)
