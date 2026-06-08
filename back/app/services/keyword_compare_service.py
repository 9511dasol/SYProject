from __future__ import annotations

import io
import re
from dataclasses import asdict, dataclass

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


class KeywordCompareService:
    def parse_file(self, content: bytes) -> list[dict]:
        xl = pd.ExcelFile(io.BytesIO(content))
        results = []

        for sheet_name in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet_name, header=None)

            if df.shape[0] < 3 or df.shape[1] < 11:
                continue

            # Row 0: title cell, Row 1: header labels, Row 2+: data
            raw_title = _safe_str(df.iloc[0, 1])
            period = _extract_period(raw_title) if raw_title else sheet_name

            rows: list[dict] = []
            for _, row in df.iloc[2:].iterrows():
                campaign_type = _safe_str(row.iloc[1])
                device = _safe_str(row.iloc[2])
                keyword = _safe_str(row.iloc[3])
                conv_type = _safe_str(row.iloc[4])

                if not keyword and not campaign_type:
                    continue

                curr_conv = _safe_float(row.iloc[5])
                curr_amount = _safe_float(row.iloc[6])
                prev_conv = _safe_float(row.iloc[7])
                prev_amount = _safe_float(row.iloc[8])
                diff_conv = _safe_float(row.iloc[9])
                diff_amount = _safe_float(row.iloc[10])

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
                continue

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

            results.append({
                "name": sheet_name,
                "period": period,
                "rows": rows,
                "summary": summary,
                "campaign_types": sorted({r["campaign_type"] for r in rows if r["campaign_type"]}),
                "devices": sorted({r["device"] for r in rows if r["device"]}),
                "conv_types": sorted({r["conv_type"] for r in rows if r["conv_type"]}),
            })

        return results
