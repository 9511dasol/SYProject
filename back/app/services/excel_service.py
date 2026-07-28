"""Excel 템플릿에 일별 원시 지표(RAW)를 채워 넣는 서비스.

템플릿 구조 (각 매체 시트 공통):
  col A   : 빈 스페이서
  col B   : 날짜 (수식 — ='summary_…'!B70 등, 수정 불가)
  row 20  : ■ {매체명} 섹션 제목
  row 21  : 컬럼 헤더
  row 22  : TOTAL 집계 행
  row 23+ : 일별 RAW 데이터 (row 23 = 해당 월 1일)

CTR·CPC·전환율 등 수식 컬럼은 Excel이 자동 계산 → 여기서는 RAW(type='n') 컬럼만 씀.
"""

import calendar
import io
import math
from datetime import date, datetime
from pathlib import Path

import openpyxl
import pandas as pd

# 템플릿은 app/assets 에 두고 git으로 함께 배포한다.
# 예전에는 back/example/ (gitignore 대상) 에 두고 배포 때 GCS에서 내려받았는데,
# 그 파일이 과거 기간 시트를 전부 안고 있어 86MB까지 불어났다 —
# 출력물도 87MB가 되어 브라우저 다운로드가 막히고 생성에 1분이 걸렸다.
# 지금 템플릿은 최신 한 기간(시트 6개)만 담고, 다른 기간은 아래 fallback 복사로 만든다.
TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "report_template.xlsx"

SHEET_PREFIX: dict[str, str] = {
    "네이버SA":  "네이버SA",
    "네이버BS":  "네이버BS",
    "카카오SA":  "카카오SA",
    "구글SA":    "구글SA",
    "네이버PSA": "파워컨텐츠",  # DB 레이블 → 템플릿 시트 접두어 (기존 템플릿 호환)
}

# 기간별로 존재하는 시트의 접두어 — "{접두어}_{기간}" 형태.
# 다른 기간 시트를 지울 때 이 목록에 있는 것만 대상으로 한다.
_PERIOD_SHEET_PREFIXES: frozenset[str] = frozenset({"summary", *SHEET_PREFIX.values()})

DATA_ROW = 23  # row 23 = 해당 월 1일 (고정 오프셋)

# summary 시트에서 '전월' 비교 행. 컬럼은 헤더(row 6)와 같은 순서다.
# 이 행은 수식이 아니라 템플릿을 만들 당시의 고정 숫자라, 템플릿에 없는 기간을
# 시트 복사로 만들면 남의 달 실적이 그대로 따라온다 → DB 값으로 덮어쓴다.
PREV_MONTH_ROW = 8
_PREV_COL_MARKUP = 8  # 광고비(vat, markup) — DB에 markup 정보가 없어 비워 둔다


# (kpi_field, col_number) — RAW 값 컬럼만 포함, 수식 컬럼 제외
# 네이버SA / 구글SA: 총전환수·전환율 등은 수식이므로 제외; 회원가입·구매완료·구매매출·신청만 입력
_NAVER_SA_COLS: list[tuple[str, int]] = [
    ("impressions",  3),   # 노출
    ("clicks",       4),   # 클릭
    ("cost",         7),   # 광고비(vat+)
    ("signup",      14),   # 회원가입
    ("purchase",    16),   # 구매완료
    ("revenue",     18),   # 구매매출
    ("apply",       21),   # 설명회신청
]

# 네이버BS: col7 광고비 = SUM(X:Y) 수식 → 원시 비용을 col24(브검PC)에 입력
_NAVER_BS_COLS: list[tuple[str, int]] = [
    ("impressions",  3),
    ("clicks",       4),
    ("cost",        24),   # 브검PC (총비용 전부 — MO 구분 없음)
    ("signup",      14),
    ("purchase",    16),
    ("revenue",     18),
    ("apply",       21),
]

_KAKAO_SA_COLS: list[tuple[str, int]] = [
    ("impressions",  3),
    ("clicks",       4),
    ("cost",         7),
    ("signup",      11),   # 회원가입
    ("purchase",    13),   # 구매완료
    ("revenue",     15),   # 구매매출
]

# 네이버PSA(파워컨텐츠): 총전환수는 RAW 값 (수식 아님)
_POWER_COLS: list[tuple[str, int]] = [
    ("impressions",  3),
    ("clicks",       4),
    ("cost",         7),
    ("total_conv",   9),   # 총전환수 (RAW)
    ("signup",      12),
    ("purchase",    14),
    ("revenue",     16),
]

_GOOGLE_SA_COLS: list[tuple[str, int]] = [
    ("impressions",  3),
    ("clicks",       4),
    ("cost",         7),
    ("signup",      15),
    ("purchase",    17),
    ("revenue",     19),
    ("apply",       22),
]

_SHEET_COLS: dict[str, list[tuple[str, int]]] = {
    "네이버SA":  _NAVER_SA_COLS,
    "네이버BS":  _NAVER_BS_COLS,
    "카카오SA":  _KAKAO_SA_COLS,
    "네이버PSA": _POWER_COLS,
    "구글SA":    _GOOGLE_SA_COLS,
}


# 전년동월(8행) 컬럼 — (kpi_field, col_number).
#
# 템플릿의 8행은 원래 외부 통합문서("[🔸SA] 매체별 데이터 & 경쟁사 모니터링_2026.xlsx")를
# =[1]네이버SA_7월!C22 형태로 참조한다. 받는 사람에게 그 파일이 없으므로 Excel에서는
# 빈칸이 되고, 이 행을 합산하는 summary 7행과 그걸 쓰는 YOY 행까지 함께 비어버린다.
# 그래서 여기서 DB 값(없으면 0)으로 대체한다 — 수식은 건드리지 않고 이 셀들만 값으로 바꾼다.
#
# 컬럼 배치가 22행(TOTAL)과 같고 매체마다 달라, 일별 컬럼맵과 별도로 둔다.
# conversions_ex_apply = 총전환수 − 설명회신청 (템플릿의 '총전환수(신청제외)')
_YOY_COLS: dict[str, list[tuple[str, int]]] = {
    "네이버SA": [
        ("impressions", 3), ("clicks", 4), ("cost", 7), ("conversions", 8),
        ("conversions_ex_apply", 11), ("signup", 14), ("purchase", 16), ("apply", 21),
    ],
    "네이버BS": [
        ("impressions", 3), ("clicks", 4), ("cost", 7), ("conversions", 8),
        ("conversions_ex_apply", 11), ("signup", 14), ("purchase", 16), ("apply", 21),
    ],
    "카카오SA": [
        ("impressions", 3), ("clicks", 4), ("cost", 7), ("conversions", 8),
        ("signup", 11), ("purchase", 13),
    ],
    "구글SA": [
        ("impressions", 3), ("clicks", 4), ("cost", 7), ("cost_markup", 8),
        ("conversions", 9), ("conversions_ex_apply", 12), ("signup", 15),
        ("purchase", 17), ("apply", 22),
    ],
    "네이버PSA": [
        ("impressions", 3), ("clicks", 4), ("cost", 7), ("conversions", 9),
    ],
}

YOY_ROW = 8  # 전년동월 행 (7=헤더, 9=전월, 10=당월)

# summary 시트의 날짜 셀 — 템플릿에서 복사해 오면 템플릿 기간(예: 7월)의 날짜가 그대로 남는다.
# 데이터 수식은 새 기간 시트를 정확히 가리키는데 날짜 라벨만 옛 달이라, 숫자는 맞고
# "언제 것인지"만 틀리는 형태가 된다. 그래서 기간이 정해지면 전부 다시 쓴다.
SUMMARY_YOY_DATE_ROW = 7    # 전년동월
SUMMARY_CURR_DATE_ROW = 9   # 당월
SUMMARY_DAILY_ROW = 70      # 일별 구간 첫 행 (= 그 달 1일)
SUMMARY_DAILY_SLOTS = 31    # 70~100행. 짧은 달은 남는 칸을 비운다


def _yoy_value(totals: dict | None, field: str) -> float:
    """전년동월 셀 값. 데이터가 없으면 0 — 외부 참조를 남겨 빈칸이 되는 것보다 낫다.

    cost_markup(광고비 vat·마크업)은 DB에 없어 항상 0이다.
    """
    if not totals or field == "cost_markup":
        return 0
    if field == "conversions_ex_apply":
        return (totals.get("conversions") or 0) - (totals.get("apply") or 0)
    return totals.get(field) or 0


def _fill_summary_dates(ws_sum, year: int, month: int) -> None:
    """summary 시트의 날짜 셀을 요청한 기간에 맞춰 다시 쓴다.

    ■ SA TOTAL 구간은 전년동월 / 전월 / 당월 3행이고, 아래 일별 구간은 그 달의 날짜다.
    전월(8행)은 _prev_month_cells 쪽에서 이미 채우므로 여기서는 나머지를 맡는다.
    """
    ws_sum.cell(SUMMARY_YOY_DATE_ROW, 2).value = datetime(year - 1, month, 1)
    ws_sum.cell(SUMMARY_CURR_DATE_ROW, 2).value = datetime(year, month, 1)

    days = calendar.monthrange(year, month)[1]
    for offset in range(SUMMARY_DAILY_SLOTS):
        # 30일 이하인 달은 남는 칸을 비운다 — 안 비우면 다음 달 1일이 그대로 남는다.
        # (매체 시트의 마지막 날짜 칸이 이 셀을 참조하므로 거기까지 함께 정리된다)
        ws_sum.cell(SUMMARY_DAILY_ROW + offset, 2).value = (
            datetime(year, month, offset + 1) if offset < days else None
        )


def _fill_yoy_row(ws, media_label: str, totals: dict | None) -> None:
    """매체 시트 8행(전년동월)의 외부 통합문서 참조를 DB 값으로 바꾼다."""
    for field, col in _YOY_COLS.get(media_label, []):
        ws.cell(YOY_ROW, col).value = _yoy_value(totals, field)


def _to_date(raw_date) -> date:
    """date / datetime / 'YYYY-MM-DD' 문자열을 Python date 객체로 변환"""
    if isinstance(raw_date, datetime):
        return raw_date.date()
    if isinstance(raw_date, date):
        return raw_date
    if isinstance(raw_date, str):
        return datetime.strptime(raw_date.strip()[:10], "%Y-%m-%d").date()
    if hasattr(raw_date, "date"):
        return raw_date.date()
    t = raw_date.timetuple()
    return date(t.tm_year, t.tm_mon, t.tm_mday)


def _day_from_date(raw_date) -> int:
    return _to_date(raw_date).day


def _clean(val) -> float | int | None:
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return 0.0
    return val


_TEMPLATE_BYTES: bytes | None = None
_TEMPLATE_MTIME: float = 0.0


def _template_bytes() -> bytes:
    """템플릿 파일이 변경되면 자동으로 재읽기 (mtime 비교)"""
    global _TEMPLATE_BYTES, _TEMPLATE_MTIME
    mtime = TEMPLATE_PATH.stat().st_mtime
    if _TEMPLATE_BYTES is None or mtime != _TEMPLATE_MTIME:
        _TEMPLATE_BYTES = TEMPLATE_PATH.read_bytes()
        _TEMPLATE_MTIME = mtime
    return _TEMPLATE_BYTES


def _div(num: float, den: float) -> float:
    return num / den if den else 0.0


def _prev_month_cells(totals: dict) -> dict[int, float | None]:
    """DB 전월 합계 → summary '전월' 행의 {열 번호: 값}.

    markup 광고비(8열)는 DB에 없어 None(빈칸)으로 둔다 — 옛 숫자를 남겨 두면
    MOM 비교가 조용히 틀리므로, 모르는 값은 비우는 편이 낫다.
    """
    imp = totals["impressions"]
    clk = totals["clicks"]
    cost = totals["cost"]
    conv = totals["conversions"]
    rev = totals["revenue"]
    signup = totals["signup"]
    purchase = totals["purchase"]
    apply_ = totals["apply"]
    conv_ex = conv - apply_  # '신청제외' 전환 = 총전환 - 설명회신청

    return {
        3: imp,                      # 노출
        4: clk,                      # 클릭
        5: _div(clk, imp),           # CTR
        6: _div(cost, clk),          # CPC
        7: cost,                     # 광고비(vat+)
        _PREV_COL_MARKUP: None,      # 광고비(vat, markup)
        9: conv,                     # 총전환수
        10: _div(conv, clk),         # 전환율
        11: _div(cost, conv),        # 전환단가
        12: conv_ex,                 # 총전환수(신청제외)
        13: _div(conv_ex, clk),      # 전환율(신청제외)
        14: _div(cost, conv_ex),     # 전환단가(신청제외)
        15: signup,                  # 회원가입
        16: _div(signup, clk),       # 회원가입률
        17: purchase,                # 구매완료
        18: _div(purchase, clk),     # 결제완료율
        19: rev,                     # 구매매출
        20: _div(rev, cost),         # 구매수익률(ROAS)
        21: _div(rev, purchase),     # 구매단가
        22: apply_,                  # 설명회신청
    }


def _drop_other_period_sheets(wb, period: str) -> None:
    """요청한 기간이 아닌 기간 시트를 지운다.

    템플릿은 최신 한 기간(시트 6개)만 갖고 있고 다른 기간은 그걸 복사해 만든다.
    복사만 하고 원본을 두면 5월 파일에도 템플릿의 7월 시트가 그대로 남아,
    받는 사람 눈에는 파일을 열자마자 '전부 7월'로 보인다.

    접두어를 아는 시트만 지운다 — 나중에 조회용·안내용 시트가 템플릿에 추가돼도
    같이 지워지지 않게.
    """
    keep_suffix = f"_{period}"
    if not any(name.endswith(keep_suffix) for name in wb.sheetnames):
        return  # 남길 시트가 하나도 없으면 손대지 않는다 (빈 워크북 방지)

    for name in list(wb.sheetnames):
        if name.endswith(keep_suffix):
            continue
        if name.rsplit("_", 1)[0] in _PERIOD_SHEET_PREFIXES:
            del wb[name]

    wb.active = 0  # 삭제로 활성 시트 인덱스가 어긋날 수 있다 — summary를 먼저 보여준다


def _copy_sheet_with_formula_update(wb, src_name: str, dst_name: str, old_period: str, new_period: str) -> None:
    """시트를 복사하고 수식 안의 기간 문자열을 교체한다."""
    ws = wb.copy_worksheet(wb[src_name])
    ws.title = dst_name
    for row in ws.iter_rows():
        for cell in row:
            if (
                cell.value
                and isinstance(cell.value, str)
                and cell.value.startswith("=")
                and old_period in cell.value
            ):
                cell.value = cell.value.replace(old_period, new_period)


class ExcelService:
    def fill_template(
        self,
        media_kpis: dict[str, pd.DataFrame],
        period: str,
        year: int | None = None,
        month: int | None = None,
        prev_totals: dict | None = None,
        yoy_media_totals: dict[str, dict] | None = None,
    ) -> bytes:
        """템플릿을 복사해 각 매체 시트에 일별 원시 지표를 채운 뒤 bytes 반환.

        prev_totals 를 주면 summary 시트의 '전월' 행을 그 값으로 덮어쓴다
        (MarketingRepository.get_period_totals 형태). 템플릿에 없는 기간은 다른 달
        시트를 복사해 만드는데, 그 복사본에 남은 옛 전월 숫자를 바로잡기 위함이다.

        yoy_media_totals 는 1년 전 같은 달의 매체별 합계
        ({매체: get_period_totals 형태}). 매체 시트 8행(전년동월)이 원래 외부 통합문서를
        참조해 받는 사람에게는 빈칸이 되므로, 이 값으로 대체한다. 데이터가 없는 매체는
        0으로 채운다 — 수식은 그대로 두고 값 셀만 바꾸므로 YOY 계산은 템플릿 그대로 돈다.
        """
        wb = openpyxl.load_workbook(
            io.BytesIO(_template_bytes()),
            keep_links=True,   # False로 하면 수식 참조가 끊겨 Excel이 손상 경고를 표시함
            keep_vba=False,
        )

        # summary 시트가 없으면 가장 최근 summary를 복사해 날짜 수식 기반 보장
        summary_name = f"summary_{period}"
        if summary_name not in wb.sheetnames:
            fallback_summary = next(
                (s for s in reversed(wb.sheetnames) if s.startswith("summary_")),
                None,
            )
            if fallback_summary:
                old_period_s = fallback_summary[len("summary_"):]
                _copy_sheet_with_formula_update(wb, fallback_summary, summary_name, old_period_s, period)

        # summary 시트의 B1(시작일)·D3(월 일수)를 해당 기간에 맞게 보정
        if year and month and summary_name in wb.sheetnames:
            ws_sum = wb[summary_name]
            ws_sum["B1"] = datetime(year, month, 1)
            ws_sum["D3"] = calendar.monthrange(year, month)[1]

            # 전년동월·당월·일별 날짜 — 템플릿 기간의 날짜가 그대로 남지 않게 다시 쓴다
            _fill_summary_dates(ws_sum, year, month)

            # 값 대입은 .value 로 한다 — ws.cell(r, c, None) 은 openpyxl이 무시해서
            # 빈칸 처리가 안 되고 템플릿에 있던 옛 숫자가 그대로 남는다.
            prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
            ws_sum.cell(PREV_MONTH_ROW, 2).value = datetime(prev_year, prev_month, 1)
            # 전월 데이터가 없으면 남의 달 숫자를 남기느니 비운다 (MOM은 IFERROR로 공백 처리됨)
            cells = _prev_month_cells(prev_totals) if prev_totals else {}
            for col in range(3, 23):
                ws_sum.cell(PREV_MONTH_ROW, col).value = cells.get(col)

        filled = 0
        for media_label, df in media_kpis.items():
            prefix = SHEET_PREFIX.get(media_label)
            if prefix is None:
                continue
            sheet_name = f"{prefix}_{period}"
            if sheet_name not in wb.sheetnames:
                # 같은 접두어를 가진 가장 최근 시트를 복사해 새 기간 시트로 사용
                fallback = next(
                    (s for s in reversed(wb.sheetnames) if s.startswith(f"{prefix}_")),
                    None,
                )
                if fallback is None:
                    continue
                old_period = fallback[len(f"{prefix}_"):]
                _copy_sheet_with_formula_update(wb, fallback, sheet_name, old_period, period)

            ws = wb[sheet_name]
            col_map = _SHEET_COLS.get(media_label, _NAVER_SA_COLS)
            self._fill_sheet(ws, df, col_map)
            # 전년동월 행은 외부 통합문서 참조라 그대로 두면 빈칸이 된다 — 항상 값으로 바꾼다
            _fill_yoy_row(ws, media_label, (yoy_media_totals or {}).get(media_label))
            filled += 1

        if filled == 0:
            raise ValueError(
                f"템플릿에 '{period}' 기간에 맞는 시트가 없고 복사할 시트도 없습니다. "
                "report_template.xlsx를 업데이트해 주세요."
            )

        # 템플릿에서 복사해 온 원본(다른 기간) 시트를 정리한다 — 채우기가 끝난 뒤에 해야
        # fallback 복사가 원본을 찾을 수 있다.
        _drop_other_period_sheets(wb, period)

        # 외부 통합문서 참조는 위에서 전부 값으로 바꿨다 — 링크 정의만 남으면
        # Excel이 열 때마다 "연결된 데이터를 업데이트할까요?"를 묻는다. 같이 지운다.
        wb._external_links = []

        wb.calculation.forceFullCalc = True  # 열 때 Excel이 수식 전체 재계산
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.read()

    def _fill_sheet(
        self,
        ws,
        df: pd.DataFrame,
        col_map: list[tuple[str, int]],
    ) -> None:
        """row 23 = 1일 오프셋 기준으로 날짜별 RAW 지표 기입.
        B열(날짜)은 수식 참조 대신 실제 날짜 값을 직접 기입한다.
        """
        fields = [f for f, _ in col_map]
        cols = [c for _, c in col_map]
        for field in fields:
            if field not in df.columns:
                df[field] = 0.0
        dates = df["date"].tolist()
        values = df[fields].values
        for i, date_val in enumerate(dates):
            d = _to_date(date_val)
            target_row = DATA_ROW + d.day - 1
            ws.cell(target_row, 2, d)          # B열: 날짜 직접 기입
            row_vals = values[i]
            for col_num, val in zip(cols, row_vals, strict=True):
                ws.cell(target_row, col_num, _clean(val))
