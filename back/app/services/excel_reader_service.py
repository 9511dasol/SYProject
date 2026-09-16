"""기존 Excel 파일을 읽어 JSON으로 반환하는 서비스."""

import io
import math
from datetime import datetime

import openpyxl


def _safe(v, default: float = 0.0) -> float:
    if v is None:
        return default
    try:
        f = float(v)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return default


def _date_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    return str(v)[:10]


def _cell_val(ws, row: int, col: int):
    v = ws.cell(row, col).value
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return 0.0
    return v


# summary 시트 row 6 컬럼 순서 (col 2~21, 0-indexed offset 0~19)
SA_TOTAL_COLS = [
    "date", "impressions", "clicks", "ctr", "cpc",
    "cost_vat", "cost_markup", "total_conv", "conv_rate", "conv_cost",
    "total_conv_ex", "conv_rate_ex", "conv_cost_ex",
    "signup", "signup_rate", "purchase", "purchase_rate",
    "revenue", "roas", "revenue_per_purchase",
]


class ExcelReaderService:
    # 시트명 → DB 레이블 (기존 "파워컨텐츠" 시트를 "네이버PSA"로 읽음)
    SHEET_TO_LABEL: dict[str, str] = {
        "네이버SA":  "네이버SA",
        "네이버BS":  "네이버BS",
        "카카오SA":  "카카오SA",
        "구글SA":    "구글SA",
        "네이버PSA": "네이버PSA",
        "파워컨텐츠": "네이버PSA",  # 기존 템플릿 시트명 → 새 DB 레이블
    }

    def read_report(self, excel_bytes: bytes, period: str | None = None) -> dict:
        """단일 기간 리포트를 반환한다.

        period 를 주지 않으면 파일에 담긴 마지막 기간을 읽는다(기존 동작 유지).
        여러 달이 한 파일에 들어 있는 경우는 read_reports() 를 쓴다.
        """
        wb = self._open(excel_bytes)
        try:
            target = period or self._detect_periods(wb)[-1]
            return self._read_one(wb, target)
        finally:
            wb.close()

    def read_reports(self, excel_bytes: bytes, periods: list[str] | None = None) -> list[dict]:
        """파일에 들어 있는 모든 기간(summary_* 시트)을 각각 리포트로 파싱한다.

        5월·6월처럼 여러 달이 한 파일에 담겨 오면 달마다 하나씩, 시트 순서대로 반환한다.
        periods 를 주면 그 기간만 골라 읽는다.
        """
        wb = self._open(excel_bytes)
        try:
            found = self._detect_periods(wb)
            if periods:
                unknown = [p for p in periods if p not in found]
                if unknown:
                    raise ValueError(f"'{', '.join(unknown)}' 기간 시트를 찾을 수 없습니다.")
                found = [p for p in found if p in periods]
            return [self._read_one(wb, p) for p in found]
        finally:
            wb.close()

    def list_periods(self, excel_bytes: bytes) -> list[str]:
        wb = self._open(excel_bytes)
        try:
            return self._detect_periods(wb)
        finally:
            wb.close()

    def list_period_summaries(self, excel_bytes: bytes) -> list[dict]:
        """업로드 모달의 기간 선택 목록용 — summary 시트만 읽고 매체 시트는 열지 않는다.

        read_reports() 는 기간마다 매체 시트까지 전부 파싱한다. 86MB·18기간짜리 실제
        리포트에서 236초가 걸렸는데, 그중 기간 하나당 7.9초 가운데 7.4초(93%)가 매체 시트
        파싱이었다. 정작 고르는 화면이 쓰는 값은 기간 이름·일수·코멘트뿐이라 그 비용이
        통째로 낭비였다 — 사용자에게는 "파일에 담긴 기간을 읽는 중…"에서 4분간 멈춘 것으로
        보인다.

        매체 시트를 건너뛰는 것만으로는 9초까지밖에 못 줄인다. read_only 모드의 ws.cell()
        은 호출마다 시트 XML을 다시 훑어서, 셀 하나하나 집는 _parse_daily_total 방식이
        기간마다 시트를 수백 번 스캔하기 때문이다. 필요한 범위를 iter_rows 로 한 번만
        흘려 읽으면 같은 파일이 0.28초에 끝난다(같은 값이 나오는 것은 대조 확인).
        """
        wb = self._open(excel_bytes)
        try:
            summaries = []
            for period in self._detect_periods(wb):
                ws = wb[f"summary_{period}"]
                comment, days = "", 0
                # 코멘트(B32)와 일별 행(B70:D101)을 한 번의 스캔으로 함께 집는다.
                # 일수 세는 조건은 _parse_daily_total 과 같아야 한다 — 날짜가 있고,
                # 노출·클릭이 둘 다 0인 행은 빈 행으로 보고 세지 않는다.
                #
                # read_only 모드의 iter_rows 는 빈 행을 채워 주지 않으므로(70행을 요청해도
                # 값이 있는 행만 온다) 순번으로 행 번호를 세면 어긋난다. 또 값이 없는 칸은
                # 행 번호가 없는 EmptyCell 이라 .row 를 그냥 읽으면 터진다. B열이 빈 행은
                # 코멘트도 일별 행도 아니므로 그대로 건너뛴다.
                for row in ws.iter_rows(min_row=32, max_row=101, min_col=2, max_col=4):
                    r = getattr(row[0], "row", None)
                    if r is None:
                        continue
                    if r == 32:
                        comment = str(row[0].value) if row[0].value else ""
                    elif r >= 70 and row[0].value is not None and len(row) >= 3:
                        if _safe(row[1].value) != 0 or _safe(row[2].value) != 0:
                            days += 1
                summaries.append({"period": period, "days": days, "comment": comment})
            return summaries
        finally:
            wb.close()

    # ── 내부 헬퍼 ─────────────────────────────────────────────────────────────

    @staticmethod
    def _open(excel_bytes: bytes):
        # read_only=True: 스트리밍 파싱으로 메모리 절약 (시트 100개 이상 대용량 파일 대응)
        # data_only=True: 수식 셀을 마지막 계산된 캐시 값으로 읽음
        #   → 날짜 수식(='summary_...'!B70)도 datetime으로 정상 반환되어 row[0] 필터를 통과함
        return openpyxl.load_workbook(io.BytesIO(excel_bytes), read_only=True, data_only=True)

    def _read_one(self, wb, period: str) -> dict:
        sname = f"summary_{period}"
        if sname not in wb.sheetnames:
            raise ValueError(f"'{sname}' 시트를 찾을 수 없습니다.")
        ws = wb[sname]

        media = {}
        for sheet_prefix, db_label in self.SHEET_TO_LABEL.items():
            ms = f"{sheet_prefix}_{period}"
            if ms in wb.sheetnames and db_label not in media:
                media[db_label] = self._parse_media_sheet(wb[ms])

        return {
            "period": period,
            "period_info": self._parse_period_info(ws),
            "sa_total": self._parse_sa_total(ws),
            "budget_table": self._parse_budget_table(ws),
            "comment": self._parse_comment(ws),
            "daily_total": self._parse_daily_total(ws),
            "media": media,
        }

    def _detect_periods(self, wb) -> list[str]:
        """summary_* 시트에서 기간 문자열을 시트 순서대로 뽑는다."""
        periods = [
            s.replace("summary_", "", 1)
            for s in wb.sheetnames
            if s.startswith("summary_")
        ]
        if not periods:
            raise ValueError("summary 시트를 찾을 수 없습니다.")
        return periods

    def _parse_period_info(self, ws) -> dict:
        return {
            "remaining_days": int(_safe(ws.cell(3, 2).value)),
            "elapsed_days": int(_safe(ws.cell(3, 3).value)),
            "total_days": int(_safe(ws.cell(3, 4).value)),
        }

    def _parse_sa_total(self, ws) -> dict:
        """summary 시트 rows 7~14: 전년/전월/당월/YOY/MOM/전주/금주/WoW"""
        # 컬럼 헤더는 row 6 (col 2~21)
        headers = [
            str(ws.cell(6, c).value or "").replace("\n", " ")
            for c in range(2, 22)
        ]

        def _parse_comparison_row(row_num: int, label: str) -> dict:
            row: dict = {"label": label}
            for i, key in enumerate(SA_TOTAL_COLS):
                v = ws.cell(row_num, 2 + i).value
                if key == "date":
                    row[key] = _date_str(v) if isinstance(v, datetime) else str(v or "")
                else:
                    row[key] = _safe(v)
            return row

        return {
            "headers": headers,
            "rows": [
                _parse_comparison_row(7, "전년"),
                _parse_comparison_row(8, "전월"),
                _parse_comparison_row(9, "당월"),
                _parse_comparison_row(10, "YOY"),
                _parse_comparison_row(11, "MOM"),
                _parse_comparison_row(12, "전주"),
                _parse_comparison_row(13, "금주"),
                _parse_comparison_row(14, "WoW"),
            ],
        }

    def _parse_budget_table(self, ws) -> list[dict]:
        rows = []
        for r in range(21, 29):
            category = ws.cell(r, 3).value
            if not category:
                continue
            rows.append({
                "category": str(category),
                "budget": _safe(ws.cell(r, 4).value),
                "spent": _safe(ws.cell(r, 5).value),
                "burn_rate": _safe(ws.cell(r, 6).value),
                "impressions": _safe(ws.cell(r, 10).value),
                "clicks": _safe(ws.cell(r, 11).value),
                "cost_vat": _safe(ws.cell(r, 12).value),
                "total_conv": _safe(ws.cell(r, 13).value),
                "conv_rate": _safe(ws.cell(r, 14).value),
                "conv_cost": _safe(ws.cell(r, 15).value),
            })
        return rows

    def _parse_comment(self, ws) -> str:
        v = ws.cell(32, 2).value
        return str(v) if v else ""

    def _parse_daily_total(self, ws) -> list[dict]:
        rows = []
        for r in range(70, 102):
            date_val = ws.cell(r, 2).value
            if date_val is None:
                continue
            imp = _safe(ws.cell(r, 3).value)
            clk = _safe(ws.cell(r, 4).value)
            if imp == 0 and clk == 0:
                continue
            rows.append({
                "date": _date_str(date_val),
                "impressions": imp,
                "clicks": clk,
                "ctr": _safe(ws.cell(r, 5).value),
                "cpc": _safe(ws.cell(r, 6).value),
                "cost": _safe(ws.cell(r, 7).value),
                "total_conv": _safe(ws.cell(r, 9).value),
                "conv_rate": _safe(ws.cell(r, 10).value),
                "conv_cost": _safe(ws.cell(r, 11).value),
            })
        return rows

    def _parse_media_sheet(self, ws) -> dict:
        # Read all candidate headers (cols 2–34), replacing None with "".
        # Do NOT stop at the first None — some templates have sparse headers.
        raw: list[str] = []
        for c in range(2, 35):
            v = ws.cell(21, c).value
            raw.append("" if v is None else str(v).replace("\n", " "))
        # Drop trailing empty entries so len(headers) == useful column count.
        while raw and raw[-1] == "":
            raw.pop()
        headers = raw

        n = len(headers)
        total = self._parse_row(ws, 22, n)
        daily = []
        for r in range(23, 54):
            row = self._parse_row(ws, r, n)
            if not row[0] or (_safe(row[1]) == 0 and _safe(row[2]) == 0):
                continue
            daily.append(row)

        return {"headers": headers, "total": total, "daily": daily}

    def _parse_row(self, ws, row_num: int, ncols: int) -> list:
        return [_cell_val(ws, row_num, 2 + i) for i in range(ncols)]

    def to_db_dataframe(self, report: dict):
        """media 시트 데이터를 DB 저장용 DataFrame으로 변환"""
        import pandas as pd
        records = []
        for media_label, sheet in report["media"].items():
            headers = sheet["headers"]

            def _find(predicate, default):
                return next((i for i, h in enumerate(headers) if predicate(h)), default)

            col_imp = 1
            col_clk = 2
            col_cost = _find(lambda h: "광고비" in h and "vat" in h.lower(), 5)
            col_conv = _find(lambda h: h.startswith("총전환수") and "제외" not in h, 6)
            col_rev = _find(lambda h: "구매매출" in h, 16)
            col_signup = _find(lambda h: "회원가입" in h, None)
            col_purchase = _find(lambda h: "구매완료" in h and "매출" not in h, None)
            col_apply = _find(lambda h: "신청" in h and "회원" not in h, None)

            def _get(row, col):
                return _safe(row[col] if col is not None and col < len(row) else None)

            for row in sheet["daily"]:
                date_val = row[0]
                if not date_val:
                    continue
                records.append({
                    "report_date": date_val,
                    "campaign_type": media_label,
                    "impressions": int(_get(row, col_imp)),
                    "clicks": int(_get(row, col_clk)),
                    "cost": _get(row, col_cost),
                    "conversions": int(_get(row, col_conv)),
                    "conversion_revenue": _get(row, col_rev),
                    "signup": _get(row, col_signup),
                    "purchase": _get(row, col_purchase),
                    "apply": _get(row, col_apply),
                })
        return pd.DataFrame(records)

    def reports_to_db_dataframe(self, reports: list[dict]):
        """여러 기간 리포트를 하나의 DB 저장용 DataFrame으로 합친다."""
        import pandas as pd
        frames = [self.to_db_dataframe(r) for r in reports]
        frames = [f for f in frames if not f.empty]
        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, ignore_index=True)
