from __future__ import annotations

import io
import re
from dataclasses import asdict, dataclass
from datetime import date

import pandas as pd


def _safe_float(v) -> float:
    try:
        f = float(v)
        return 0.0 if (f != f or f == float("inf") or f == float("-inf")) else f
    except Exception:
        return 0.0


def _safe_str(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in ("nan", "None", "NaN") else s


def _extract_period(raw: str) -> str:
    m = re.search(r"\((\d{4}\.\d{2}\.\d{2}\.?~\d{4}\.\d{2}\.\d{2}\.?)\)", raw)
    return m.group(1) if m else raw


def _period_end_date(period: str) -> date | None:
    m = re.search(r"~(\d{4})\.(\d{2})\.(\d{2})\.?", period)
    if not m:
        return None
    y, mo, d = (int(x) for x in m.groups())
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def _row_status(curr_conv: float, prev_conv: float, diff_conv: float) -> str:
    if prev_conv == 0 and curr_conv > 0:
        return "new"
    if curr_conv == 0 and prev_conv > 0:
        return "gone"
    if diff_conv > 0:
        return "up"
    if diff_conv < 0:
        return "down"
    return "same"


@dataclass
class SheetSummary:
    total_curr_conv: float
    total_curr_amount: float
    total_prev_conv: float
    total_prev_amount: float
    diff_conv: float
    diff_amount: float
    count_up: int
    count_down: int
    count_new: int
    count_gone: int
    count_same: int


def _normalize_label(v) -> str:
    """헤더 라벨 비교용: 공백류만 제거(내부 공백 포함). 오탈자·다른 단어까지는 흡수하지 않음."""
    return re.sub(r"\s+", "", _safe_str(v))


def _header_offset(df: pd.DataFrame) -> int | None:
    """헤더 행(row 1)에서 '캠페인유형' 라벨이 있는 컬럼 오프셋(0 또는 1)을 찾는다.
    시트 맨 앞에 빈 보조 컬럼이 있는 포맷과 없는 포맷을 모두 지원하기 위함.
    공백 유무(예: '캠페인 유형')는 흡수하되, 라벨 자체가 다르면 계속 걸러낸다."""
    if df.shape[0] < 2:
        return None
    header_row = df.iloc[1]
    for offset in (0, 1):
        if offset < len(header_row) and _normalize_label(header_row.iloc[offset]) == "캠페인유형":
            return offset
    return None


def _parse_merged_sheet(df: pd.DataFrame, offset: int) -> dict | None:
    """이번/저번 기간이 이미 한 시트에 나란히 담긴 포맷(비교 컬럼 10개) 파싱"""
    raw_title = _safe_str(df.iloc[0, offset])
    period = _extract_period(raw_title) if raw_title else None

    rows: list[dict] = []
    for _, row in df.iloc[2:].iterrows():
        campaign_type = _safe_str(row.iloc[offset])
        device = _safe_str(row.iloc[offset + 1])
        keyword = _safe_str(row.iloc[offset + 2])
        conv_type = _safe_str(row.iloc[offset + 3])

        if not keyword and not campaign_type:
            continue

        curr_conv = _safe_float(row.iloc[offset + 4])
        curr_amount = _safe_float(row.iloc[offset + 5])
        prev_conv = _safe_float(row.iloc[offset + 6])
        prev_amount = _safe_float(row.iloc[offset + 7])
        diff_conv = _safe_float(row.iloc[offset + 8])
        diff_amount = _safe_float(row.iloc[offset + 9])

        rows.append({
            "campaign_type": campaign_type,
            "device": device,
            "keyword": keyword,
            "conv_type": conv_type,
            "curr_conv": curr_conv,
            "curr_amount": curr_amount,
            "prev_conv": prev_conv,
            "prev_amount": prev_amount,
            "diff_conv": diff_conv,
            "diff_amount": diff_amount,
            "status": _row_status(curr_conv, prev_conv, diff_conv),
        })

    if not rows:
        return None
    return {"period": period, "rows": rows}


def _parse_raw_period_sheet(df: pd.DataFrame, offset: int) -> dict | None:
    """한 시트 = 한 기간의 원시 데이터만 담긴 포맷(전환수/전환매출액 컬럼만 6개) 파싱"""
    raw_title = _safe_str(df.iloc[0, offset])
    period = _extract_period(raw_title) if raw_title else None

    entries: dict[tuple[str, str, str, str], dict[str, float]] = {}
    for _, row in df.iloc[2:].iterrows():
        campaign_type = _safe_str(row.iloc[offset])
        device = _safe_str(row.iloc[offset + 1])
        keyword = _safe_str(row.iloc[offset + 2])
        conv_type = _safe_str(row.iloc[offset + 3])

        if not keyword and not campaign_type:
            continue

        conv = _safe_float(row.iloc[offset + 4])
        amount = _safe_float(row.iloc[offset + 5])
        entries[(campaign_type, device, keyword, conv_type)] = {"conv": conv, "amount": amount}

    if not entries:
        return None
    return {
        "period": period,
        "end_date": _period_end_date(period) if period else None,
        "entries": entries,
    }


def _compare_periods(curr: dict, prev: dict | None) -> dict:
    """단일 기간 시트 2개(이번/저번)를 키워드 키 기준으로 매칭해 증감을 직접 계산"""
    curr_entries = curr["entries"]
    prev_entries = prev["entries"] if prev else {}

    rows: list[dict] = []
    for key in sorted(set(curr_entries) | set(prev_entries)):
        campaign_type, device, keyword, conv_type = key
        c = curr_entries.get(key, {"conv": 0.0, "amount": 0.0})
        p = prev_entries.get(key, {"conv": 0.0, "amount": 0.0})
        diff_conv = c["conv"] - p["conv"]
        diff_amount = c["amount"] - p["amount"]

        rows.append({
            "campaign_type": campaign_type,
            "device": device,
            "keyword": keyword,
            "conv_type": conv_type,
            "curr_conv": c["conv"],
            "curr_amount": c["amount"],
            "prev_conv": p["conv"],
            "prev_amount": p["amount"],
            "diff_conv": diff_conv,
            "diff_amount": diff_amount,
            "status": _row_status(c["conv"], p["conv"], diff_conv),
        })

    period = curr["period"] or curr["name"]
    if prev and prev["period"]:
        period = f"{prev['period']} → {period}"

    name = curr["period"] or curr["name"]
    return _build_sheet_result(name, period, rows)


def _build_sheet_result(name: str, period: str | None, rows: list[dict]) -> dict:
    statuses = [r["status"] for r in rows]
    summary = asdict(SheetSummary(
        total_curr_conv=sum(r["curr_conv"] for r in rows),
        total_curr_amount=sum(r["curr_amount"] for r in rows),
        total_prev_conv=sum(r["prev_conv"] for r in rows),
        total_prev_amount=sum(r["prev_amount"] for r in rows),
        diff_conv=sum(r["diff_conv"] for r in rows),
        diff_amount=sum(r["diff_amount"] for r in rows),
        count_up=statuses.count("up"),
        count_down=statuses.count("down"),
        count_new=statuses.count("new"),
        count_gone=statuses.count("gone"),
        count_same=statuses.count("same"),
    ))

    return {
        "name": name,
        "period": period or name,
        "rows": rows,
        "summary": summary,
        "campaign_types": sorted({r["campaign_type"] for r in rows if r["campaign_type"]}),
        "devices": sorted({r["device"] for r in rows if r["device"]}),
        "conv_types": sorted({r["conv_type"] for r in rows if r["conv_type"]}),
    }


class KeywordCompareService:
    def parse_file(self, content: bytes) -> dict:
        """반환값: {"sheets": [...], "skipped": [{"name", "reason"}, ...]}
        skipped는 화면에 아무 결과가 안 나올 때 원인을 바로 알 수 있도록 남기는 진단 정보."""
        xl = pd.ExcelFile(io.BytesIO(content))
        results: list[dict] = []
        raw_periods: list[dict] = []
        skipped: list[dict] = []

        for sheet_name in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
            if df.shape[0] < 3:
                skipped.append({"name": sheet_name, "reason": "데이터 행이 3개 미만입니다."})
                continue

            offset = _header_offset(df)
            if offset is None:
                skipped.append({"name": sheet_name, "reason": "'캠페인유형' 헤더를 찾을 수 없습니다."})
                continue
            available_cols = df.shape[1] - offset

            if available_cols >= 10:
                # 이번/저번 기간이 이미 한 시트에 나란히 담긴 포맷
                merged = _parse_merged_sheet(df, offset)
                if merged:
                    results.append(_build_sheet_result(sheet_name, merged["period"], merged["rows"]))
                else:
                    skipped.append({"name": sheet_name, "reason": "파싱 가능한 데이터 행이 없습니다."})
            elif available_cols >= 6:
                # 한 시트 = 한 기간만 담긴 원시 데이터 포맷 → 뒤에서 기간끼리 매칭 비교
                raw = _parse_raw_period_sheet(df, offset)
                if raw:
                    raw_periods.append({"name": sheet_name, **raw})
                else:
                    skipped.append({"name": sheet_name, "reason": "파싱 가능한 데이터 행이 없습니다."})
            else:
                skipped.append({
                    "name": sheet_name,
                    "reason": f"헤더는 인식했지만 컬럼 수가 부족합니다 ({available_cols}개, 최소 6개 필요).",
                })

        # 제목에서 기간(날짜)을 못 읽은 시트는 순서를 확신할 수 없으므로
        # 비교에 억지로 끼워넣지 않고 제외한다 (증감 부호가 뒤집히는 조용한 오류 방지)
        dated_periods = [p for p in raw_periods if p["end_date"] is not None]
        for p in raw_periods:
            if p["end_date"] is None:
                skipped.append({
                    "name": p["name"],
                    "reason": "제목에서 기간(날짜)을 인식할 수 없어 다른 기간과의 비교에서 제외되었습니다.",
                })

        if dated_periods:
            dated_periods.sort(key=lambda p: p["end_date"])
            if len(dated_periods) == 1:
                results.append(_compare_periods(dated_periods[0], None))
            else:
                # 기간이 3개 이상이면 인접한 기간끼리 순서대로 비교 시트를 만든다
                for prev_period, curr_period in zip(dated_periods, dated_periods[1:]):
                    results.append(_compare_periods(curr_period, prev_period))

        return {"sheets": results, "skipped": skipped}
