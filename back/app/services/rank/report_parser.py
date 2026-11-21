"""키워드 보고서(CSV/Excel) → RankObservation 파싱.

네이버 검색광고 관리시스템에서 내려받는 키워드 보고서를 받는다. 포맷이 조금씩
달라서(맨 앞 보조 컬럼, 디바이스 분리 여부, 컬럼 순서) 열 위치를 박아 두지 않고
헤더 행에서 라벨("키워드", "평균노출순위")을 찾아 매핑한다 — keyword_compare 의
_header_offset 과 같은 접근이다.

인코딩: 네이버 다운로드 CSV 는 utf-8-sig 또는 cp949 로 온다. 순서대로 시도한다.
"""

from __future__ import annotations

import io
import math
import re
from datetime import date

import pandas as pd

from app.services.rank.base import RankObservation

# 헤더 탐색은 파일 앞부분만 본다 — 보고서 제목·기간 행이 위에 몇 줄 있을 수 있다.
_HEADER_SCAN_ROWS = 10

_KEYWORD_LABELS = {"키워드"}
_RANK_LABELS = {"평균노출순위", "평균순위"}
_IMP_LABELS = {"노출수", "노출"}
_CLICK_LABELS = {"클릭수", "클릭"}
_DEVICE_LABELS = {"pc/모바일매체", "pc/모바일", "디바이스", "매체", "기기"}

# 키워드 칸에 이런 값이 오면 실제 키워드가 아니다 — 합계 행이거나,
# 파일 중간에 헤더가 한 번 더 들어간 경우다(보고서를 이어붙이면 흔하다).
# 그냥 두면 "키워드" · "소계" 라는 이름의 유령 키워드가 적재된다.
_TOTAL_MARKERS = {"합계", "총합계", "총계", "소계", "전체", "total", "subtotal", "키워드"}


class RankReportParseError(Exception):
    """보고서를 해석하지 못함 — 사용자에게 그대로 보여줄 한국어 메시지를 담는다."""


def _normalize_label(v) -> str:
    """헤더 라벨 비교용: 공백 제거 + 소문자화. 괄호 주석(VAT포함 등)은 떼어낸다."""
    s = "" if v is None else str(v)
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"\s+", "", s).lower()


def _safe_text(v) -> str:
    """셀 값을 사람이 읽는 문자열로. pandas 의 결측값 표기는 빈 문자열로 떨군다."""
    s = "" if v is None else str(v).strip()
    return "" if s in ("nan", "None", "NaN") else s


def normalize_keyword(v) -> str:
    """키워드 매칭용: 공백 제거 + 소문자화. 네이버는 키워드 내 공백을 구분하지 않는다."""
    return re.sub(r"\s+", "", _safe_text(v)).lower()


def _normalize_device(v) -> str:
    s = _normalize_label(v)
    if "pc" in s:
        return "pc"
    if "모바일" in s or "mobile" in s:
        return "mobile"
    return "all"


def _to_int(v) -> int:
    """숫자가 아니면 0. 'inf' 같은 값도 0 으로 떨어뜨린다.

    OverflowError 를 함께 잡는 이유: int(float("inf")) 는 ValueError 가 아니라
    OverflowError 라서, 보고서에 inf 가 한 칸만 있어도 파싱 실패(422)가 아니라
    처리되지 않은 예외(500)로 나갔다.
    """
    try:
        f = float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(f):
        return 0
    try:
        return int(f)
    except (OverflowError, ValueError):
        return 0


def _to_rank(v) -> float | None:
    """평균노출순위 → float. 비었거나 0 이하면 '노출 없음'으로 본다(순위는 1부터).

    무한대도 '없음'으로 본다 — 저장해 두면 화면·메일에서는 null(노출 없음)로 보이는데
    판정 쪽에서는 '최악의 하락'으로 읽혀 둘이 어긋난다.
    """
    try:
        f = float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f) or f <= 0:  # NaN · ±inf · 0 이하
        return None
    return f


def _read_dataframe(content: bytes, filename: str) -> pd.DataFrame:
    lowered = filename.lower()
    if lowered.endswith((".xlsx", ".xlsm")):
        try:
            return pd.read_excel(io.BytesIO(content), header=None)
        except Exception as exc:
            raise RankReportParseError(f"엑셀 파일을 열 수 없습니다: {filename}") from exc

    for encoding in ("utf-8-sig", "cp949"):
        try:
            text = content.decode(encoding)
        except UnicodeDecodeError:
            continue
        try:
            # sep=None + python 엔진: 쉼표/탭 구분을 모두 자동 감지한다.
            return pd.read_csv(io.StringIO(text), header=None, sep=None, engine="python")
        except Exception as exc:
            raise RankReportParseError(f"CSV 파일을 해석할 수 없습니다: {filename}") from exc
    raise RankReportParseError(
        f"파일 인코딩을 알 수 없습니다: {filename} (utf-8 또는 cp949만 지원)"
    )


def _find_columns(df: pd.DataFrame) -> tuple[int, dict[str, int]]:
    """헤더 행 위치와 {역할: 컬럼 인덱스}를 찾는다. 키워드·순위 열은 필수."""
    for row_idx in range(min(_HEADER_SCAN_ROWS, df.shape[0])):
        labels = [_normalize_label(v) for v in df.iloc[row_idx]]
        cols: dict[str, int] = {}
        for col_idx, label in enumerate(labels):
            if not label:
                continue
            if label in _KEYWORD_LABELS and "keyword" not in cols:
                cols["keyword"] = col_idx
            elif label in _RANK_LABELS and "rank" not in cols:
                cols["rank"] = col_idx
            elif label in _IMP_LABELS and "impressions" not in cols:
                cols["impressions"] = col_idx
            elif label in _CLICK_LABELS and "clicks" not in cols:
                cols["clicks"] = col_idx
            elif label in _DEVICE_LABELS and "device" not in cols:
                cols["device"] = col_idx
        if "keyword" in cols and "rank" in cols:
            return row_idx, cols
    raise RankReportParseError(
        "키워드 보고서 형식이 아닙니다 — '키워드'와 '평균노출순위' 컬럼을 찾지 못했습니다. "
        "광고시스템의 키워드 보고서(평균노출순위 포함)를 올려 주세요."
    )


def parse_rank_report(
    content: bytes, filename: str, stat_date: date
) -> list[RankObservation]:
    """보고서 바이트 → 관측값 목록. 같은 (키워드, 디바이스)가 여러 행이면 합산한다.

    보고서가 캠페인·그룹별로 쪼개져 있으면 같은 키워드가 여러 줄 올 수 있다.
    노출·클릭은 더하고, 순위는 노출수 가중 평균으로 합친다 — 노출 10회짜리 행과
    10,000회짜리 행의 순위를 같은 무게로 평균 내면 실제와 동떨어진다.
    """
    df = _read_dataframe(content, filename)
    header_row, cols = _find_columns(df)

    # 묶는 기준은 정규화한 키워드지만, 내보낼 때는 **보고서에 적힌 그대로** 쓴다.
    # 정규화한 값을 그대로 돌려주면 "Nike Air Max" 가 "nikeairmax" 로 바뀌어,
    # 화면의 "감시 미등록 키워드" 목록이 보고서에 없는 문자열을 보여 준다.
    # (keyword, device) -> [imp 합, clk 합, rank*imp 가중합, rank 있는 행의 imp 합, 단순 rank 합, rank 행 수]
    merged: dict[tuple[str, str], list[float]] = {}
    originals: dict[str, str] = {}

    for _, row in df.iloc[header_row + 1 :].iterrows():
        raw = _safe_text(row.iloc[cols["keyword"]])
        keyword = normalize_keyword(raw)
        if not keyword or keyword in _TOTAL_MARKERS:
            continue
        originals.setdefault(keyword, raw)

        device = (
            _normalize_device(row.iloc[cols["device"]]) if "device" in cols else "all"
        )
        imp = _to_int(row.iloc[cols["impressions"]]) if "impressions" in cols else 0
        clk = _to_int(row.iloc[cols["clicks"]]) if "clicks" in cols else 0
        rank = _to_rank(row.iloc[cols["rank"]])

        acc = merged.setdefault((keyword, device), [0, 0, 0.0, 0, 0.0, 0])
        acc[0] += imp
        acc[1] += clk
        if rank is not None:
            acc[2] += rank * imp
            acc[3] += imp
            acc[4] += rank
            acc[5] += 1

    observations: list[RankObservation] = []
    for (keyword, device), (imp, clk, w_sum, w_imp, r_sum, r_cnt) in merged.items():
        if w_imp > 0:
            avg_rank: float | None = w_sum / w_imp
        elif r_cnt > 0:  # 순위는 있는데 노출수 컬럼이 없거나 전부 0 — 단순 평균으로 대체
            avg_rank = r_sum / r_cnt
        else:
            avg_rank = None
        observations.append(
            RankObservation(
                keyword=originals.get(keyword, keyword),
                device=device,
                stat_date=stat_date,
                avg_rank=avg_rank,
                impressions=int(imp),
                clicks=int(clk),
            )
        )

    if not observations:
        raise RankReportParseError("보고서에 키워드 행이 없습니다.")
    return observations
