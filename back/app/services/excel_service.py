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

import io
import math
from datetime import date, datetime
from pathlib import Path

import openpyxl
import pandas as pd

TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "example"
    / "(🔸SA) 매체별 데이터 & 경쟁사 모니터링_20265월.xlsx"
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


def _day_from_date(raw_date) -> int:
    """date / datetime / 'YYYY-MM-DD' 문자열에서 일(day) 추출"""
    if raw_date is None:
        return 1
    if isinstance(raw_date, (date, datetime)):
        return raw_date.day
    if isinstance(raw_date, str):
        s = raw_date.strip()[:10]
        if len(s) >= 10 and s[4] == "-":
            return int(s[8:10])
        return datetime.strptime(s, "%Y-%m-%d").day
    if hasattr(raw_date, "day"):
        return int(raw_date.day)
    return raw_date.timetuple().tm_mday


def _clean(val) -> float | int | None:
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return 0.0
    return val


_TEMPLATE_BYTES: bytes | None = None


def _template_bytes() -> bytes:
    """8MB+ 템플릿 디스크 재읽기 방지 (프로세스당 1회 로드)"""
    global _TEMPLATE_BYTES
    if _TEMPLATE_BYTES is None:
        _TEMPLATE_BYTES = TEMPLATE_PATH.read_bytes()
    return _TEMPLATE_BYTES


class ExcelService:
    def fill_template(
        self,
        media_kpis: dict[str, pd.DataFrame],
        period: str,
    ) -> bytes:
        """템플릿을 복사해 각 매체 시트에 일별 원시 지표를 채운 뒤 bytes 반환"""
        wb = openpyxl.load_workbook(
            io.BytesIO(_template_bytes()),
            keep_links=True,   # False로 하면 수식 참조가 끊겨 Excel이 손상 경고를 표시함
            keep_vba=False,
        )

        for media_label, df in media_kpis.items():
            prefix = SHEET_PREFIX.get(media_label)
            if prefix is None:
                continue
            sheet_name = f"{prefix}_{period}"
            if sheet_name not in wb.sheetnames:
                continue

            ws = wb[sheet_name]
            col_map = _SHEET_COLS.get(media_label, _NAVER_SA_COLS)
            self._fill_sheet(ws, df, col_map)

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
        """row 23 = 1일 오프셋 기준으로 날짜별 RAW 지표 기입"""
        fields = [f for f, _ in col_map]
        cols = [c for _, c in col_map]
        for field in fields:
            if field not in df.columns:
                df[field] = 0.0
        dates = df["date"].tolist()
        values = df[fields].values
        for i, date_val in enumerate(dates):
            target_row = DATA_ROW + _day_from_date(date_val) - 1
            row_vals = values[i]
            for col_num, val in zip(cols, row_vals, strict=True):
                ws.cell(target_row, col_num, _clean(val))
