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

TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "example"
    / "report_template.xlsx"
)

SHEET_PREFIX: dict[str, str] = {
    "네이버SA":  "네이버SA",
    "네이버BS":  "네이버BS",
    "카카오SA":  "카카오SA",
    "구글SA":    "구글SA",
    "네이버PSA": "파워컨텐츠",  # DB 레이블 → 템플릿 시트 접두어 (기존 템플릿 호환)
}

DATA_ROW = 23  # row 23 = 해당 월 1일 (고정 오프셋)


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
        month: int | None = None,  # 현재는 미사용, 향후 확장용으로 보존
    ) -> bytes:
        """템플릿을 복사해 각 매체 시트에 일별 원시 지표를 채운 뒤 bytes 반환"""
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
            filled += 1

        if filled == 0:
            raise ValueError(
                f"템플릿에 '{period}' 기간에 맞는 시트가 없고 복사할 시트도 없습니다. "
                "report_template.xlsx를 업데이트해 주세요."
            )

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
