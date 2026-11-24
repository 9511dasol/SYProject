"""주간 리포트(RAW 탭) 양식 리더 — 대행사가 보내 주는 `Weekly Report_*.xlsb`.

기존 `excel_reader_service` 가 읽는 월간 템플릿과는 생김새가 완전히 다르다.

  월간 템플릿: 기간마다 시트가 한 벌씩(`summary_26년 5월`, `네이버SA_26년 5월` …).
               값은 고정된 행·열 좌표에 박혀 있고, 한 파일이 곧 한두 달이다.
  주간 리포트: `RAW` 시트 하나에 **tidy long format** 으로 전 기간이 들어 있다.
               한 행 = (날짜 · 캠페인 · 그룹 · 기기 · 이벤트) 하나의 실적이고,
               2024-01 부터 보고서 작성일까지 35개월·57만 행이 한 파일에 쌓인다.

그래서 이 리더는 좌표를 세지 않고 **헤더 이름으로 컬럼을 찾은 뒤 (날짜, 매체) 로
집계**한다. 대행사가 컬럼 순서를 바꿔도 깨지지 않고, 같은 날 같은 매체에 흩어져 있는
수백 행이 DB 한 행으로 합쳐진다.

반드시 지켜야 하는 두 가지:

1. **노출·클릭이 0인 행을 버리면 안 된다.** 월간 템플릿 리더는 `imp==0 and clk==0`
   인 일별 행을 빈 행으로 보고 건너뛴다(`_parse_daily_total`). 이 파일에서 같은 규칙을
   쓰면 매출의 **98.8%** 가 사라진다 — 전환·매출은 집행 행이 아니라 별도 행으로 들어오고
   (전환 기여일이 집행일과 다르므로) 그 행들은 노출·클릭·광고비가 모두 0이다.
   실제로 전환을 가진 행 39,601개 중 매출 439억 원이 그런 모양이다.
   여기서는 **집계 후** 모든 지표가 0인 (날짜,매체) 조합만 버린다.

2. **광고비는 `광고비(vat+)` 를 쓴다.** 옆에 `광고비(vat,markup)` 가 나란히 있는데
   이쪽은 대행 수수료가 붙은 금액이라 DB(`marketing_data.cost`)의 기존 기준과 다르다.
   헤더를 정확히 일치 비교하는 이유가 이것이다.

검증: 이 리더의 집계값은 파일이 자체적으로 들고 있는 피벗(`Summary` 시트 ■ 동기간
데이터)과 일치한다 — 26년 11월 노출 27,112,044 / 26년 10월 20,831,678 가 SA·DA 합계로
정확히 맞는다. 또 2025-04~2026-07 구간은 기존 DB 적재값과 노출이 일치한다.
"""

import datetime as dt
import io
import logging
import math
import re

logger = logging.getLogger(__name__)

SHEET_RAW = "RAW"
SHEET_REVIEW = "review"


# ── RAW 시트에서 찾아야 하는 컬럼 ────────────────────────────────────────────────
# 값은 공백·개행을 없앤 헤더 문자열과 **정확히** 일치해야 한다. "총전환수" 와
# "총전환수(신청제외)", "광고비(vat+)" 와 "광고비(vat,markup)" 를 가르는 장치다.
RAW_COLUMNS: dict[str, str] = {
    "date": "날짜",
    "ad_type": "광고유형",
    "platform": "매체/플랫폼",
    "impressions": "노출",
    "clicks": "클릭",
    "cost": "광고비(vat+)",
    "conversions": "총전환수",
    "signup": "회원가입수",
    "purchase": "구매완료수",
    "revenue": "구매매출액",
    "apply": "설명회신청",
}

# ── (광고유형, 매체/플랫폼) → DB 레이블 ──────────────────────────────────────────
# SA·BS·PSA 는 기존 DB 레이블 5종에 그대로 들어맞는다. 2025-04~2026-07 구간에서
# 이 매핑으로 집계한 노출이 기존 적재값과 일치하는 것으로 확인했다.
PLATFORM_TO_LABEL: dict[tuple[str, str], str] = {
    ("SA", "naver_sa"): "네이버SA",
    ("SA", "kakao_sa"): "카카오SA",
    ("SA", "google_sa"): "구글SA",
    ("BS", "naverbs_pc"): "네이버BS",
    ("BS", "naverbs_mo"): "네이버BS",
    ("PSA", "naver_power(pc)"): "네이버PSA",
    ("PSA", "naver_power(mo)"): "네이버PSA",
}

# DA(디스플레이·배너·영상)는 기존 DB에 없던 채널이고 플랫폼이 17종이라, 플랫폼명을
# 그대로 레이블로 쓰면 대시보드 범례가 22줄이 된다. 집행 규모를 기준으로 세 그룹으로
# 묶는다 — 구글 약 4.4억, 카카오 약 1.3억, 나머지 합계 약 0.8억(누적 광고비).
DA_PLATFORM_GROUPS: dict[str, str] = {
    "google_gdn": "구글DA",
    "google_youtube": "구글DA",
    "google_discovery": "구글DA",
    "google_p-max": "구글DA",
    "kakao_bizboard": "카카오DA",
}
# 위 표에 없는 DA 플랫폼(criteo·tving·mobon·gfa·adn·DOOH·taboola·tiktok …)은 모두 여기로.
# 대행사가 새 매체를 붙여도 행이 조용히 사라지지 않게 하는 안전망이다.
DA_FALLBACK_LABEL = "기타DA"

#: 이 양식이 만들어 낼 수 있는 campaign_type 전체 — 프론트 MEDIA_ORDER 와 맞춰 둔다.
KNOWN_LABELS: tuple[str, ...] = (
    "네이버SA", "네이버BS", "카카오SA", "구글SA", "네이버PSA",
    "구글DA", "카카오DA", "기타DA",
)

# ── 화면용 매체 표의 컬럼 순서 ───────────────────────────────────────────────────
# `MediaSheetData.daily` 는 위치 기반 리스트라, 쓰는 쪽과 읽는 쪽이 같은 상수를
# 봐야 어긋나지 않는다. 월간 템플릿 리더가 헤더를 퍼지 매칭(`_find`)하다가 컬럼이
# 밀리면 조용히 다른 값을 읽던 문제를 여기서는 상수 하나로 막는다.
MEDIA_COLUMNS: tuple[str, ...] = (
    "날짜", "노출", "클릭", "CTR", "CPC", "광고비(vat+)",
    "총전환수", "전환율", "전환단가",
    "회원가입수", "구매완료수", "구매매출액", "ROAS", "설명회신청",
)
_MC: dict[str, int] = {name: i for i, name in enumerate(MEDIA_COLUMNS)}

#: DB 컬럼 → 집계 대상 (metric key)
_METRICS: tuple[str, ...] = (
    "impressions", "clicks", "cost", "conversions",
    "signup", "purchase", "revenue", "apply",
)


def _norm_header(v: object) -> str:
    """헤더 비교용 정규화 — 개행·공백을 전부 지운다.

    RAW 헤더에는 `캠페인 유형\\n(매체)` 처럼 개행이 들어 있고, 같은 컬럼이 파일에 따라
    `광고비 (vat+)` 로 띄어 쓰여 오기도 한다.
    """
    return re.sub(r"\s+", "", str(v or ""))


def _num(v: object) -> float:
    """숫자 셀 → float. 빈 칸·`-`·문자열은 0 으로 본다."""
    if v is None or isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        f = float(v)
        return 0.0 if (math.isnan(f) or math.isinf(f)) else f
    try:
        f = float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if (math.isnan(f) or math.isinf(f)) else f


def _as_date(v: object) -> dt.date | None:
    """날짜 셀 → date. calamine 은 보통 date/datetime 으로 주지만 엑셀 일련번호도 받는다."""
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        n = int(v)
        # 1899-12-30 기준 — 엑셀의 1900 윤년 버그까지 포함한 통상 기준점
        if 1 <= n <= 200_000:
            return dt.date(1899, 12, 30) + dt.timedelta(days=n)
        return None
    text = str(v or "").strip()[:10]
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        return None


def label_for(ad_type: str, platform: str) -> str:
    """(광고유형, 매체/플랫폼) → DB campaign_type 레이블."""
    hit = PLATFORM_TO_LABEL.get((ad_type, platform))
    if hit:
        return hit
    if ad_type == "DA":
        return DA_PLATFORM_GROUPS.get(platform, DA_FALLBACK_LABEL)
    # SA/BS/PSA 에 새 플랫폼이 붙은 경우. 행을 버리면 합계가 조용히 틀어지므로
    # 눈에 띄는 레이블로 남기고 로그를 남긴다.
    logger.warning("RAW: 알 수 없는 매체 조합 (광고유형=%s, 매체/플랫폼=%s)", ad_type, platform)
    return f"기타{ad_type}" if ad_type else "기타"


def period_label(year: int, month: int) -> str:
    """(2026, 11) → '26년 11월' — 기존 업로드 모달·라우터와 같은 표기."""
    return f"{year % 100}년 {month}월"


def parse_period_label(label: str) -> tuple[int, int] | None:
    """'26년 11월' → (2026, 11)."""
    m = re.search(r"(\d{2,4})\s*년\s*(\d{1,2})\s*월", str(label))
    if not m:
        return None
    year = int(m.group(1))
    return (year + 2000 if year < 100 else year, int(m.group(2)))


class WeeklyRawReaderService:
    """`RAW` 시트 하나에 전 기간이 들어 있는 주간 리포트 양식 리더."""

    name = "weekly_raw"
    label = "주간 리포트 (RAW 탭)"

    # ── 양식 판별 ──────────────────────────────────────────────────────────────

    @classmethod
    def matches(cls, content: bytes) -> bool:
        """`RAW` 시트가 있고 그 첫 행이 이 양식의 필수 헤더를 갖고 있으면 참."""
        try:
            wb = cls._open(content)
            if SHEET_RAW not in wb.sheet_names:
                return False
            head = wb.get_sheet_by_name(SHEET_RAW).to_python(skip_empty_area=False, nrows=1)
        except Exception:
            return False
        if not head:
            return False
        present = {_norm_header(v) for v in head[0]}
        return set(RAW_COLUMNS.values()) <= present

    # ── 공개 API (report_formats 프로토콜) ──────────────────────────────────────

    def list_period_summaries(self, content: bytes) -> list[dict]:
        """업로드 모달의 기간 선택 목록 — {period, days, comment}.

        RAW 한 장을 읽으면 기간·일수가 모두 나오므로 월간 템플릿처럼 빠른 경로를
        따로 둘 필요가 없다(57만 행 약 3초).
        """
        frame = self._aggregate(content)
        comments = self._review_comment(content)
        latest = max(frame["report_date"]) if len(frame) else None

        out: list[dict] = []
        for (year, month), days in self._days_per_period(frame).items():
            # review 시트의 코멘트는 '이번 주' 평이라 가장 최근 달에만 붙인다.
            is_latest = latest is not None and (year, month) == (latest.year, latest.month)
            out.append({
                "period": period_label(year, month),
                "days": days,
                "comment": comments if is_latest else "",
            })
        return out

    def read_reports(self, content: bytes, periods: list[str] | None = None) -> list[dict]:
        """기간별 리포트 dict 목록 (schemas/excel_report_schema.ExcelReport 모양)."""
        frame = self._aggregate(content)
        wanted = self._resolve_periods(frame, periods)
        comment = self._review_comment(content)
        latest = max(frame["report_date"]) if len(frame) else None

        reports = []
        for year, month in wanted:
            is_latest = latest is not None and (year, month) == (latest.year, latest.month)
            reports.append(
                self._build_report(frame, year, month, comment if is_latest else "")
            )
        return reports

    def to_db_dataframe(self, report: dict):
        """리포트 dict → DB 저장용 DataFrame.

        `MEDIA_COLUMNS` 위치 규약을 읽는 쪽. 쓰는 쪽(`_media_sheet`)과 같은 상수를 본다.
        """
        import pandas as pd

        records = []
        for label, sheet in report["media"].items():
            for row in sheet["daily"]:
                day = _as_date(row[_MC["날짜"]])
                if day is None:
                    continue
                records.append({
                    "report_date": day,
                    "campaign_type": label,
                    "impressions": int(_num(row[_MC["노출"]])),
                    "clicks": int(_num(row[_MC["클릭"]])),
                    "cost": _num(row[_MC["광고비(vat+)"]]),
                    "conversions": int(round(_num(row[_MC["총전환수"]]))),
                    "conversion_revenue": _num(row[_MC["구매매출액"]]),
                    "signup": _num(row[_MC["회원가입수"]]),
                    "purchase": _num(row[_MC["구매완료수"]]),
                    "apply": _num(row[_MC["설명회신청"]]),
                })
        return pd.DataFrame(records)

    def reports_to_db_dataframe(self, reports: list[dict]):
        import pandas as pd

        frames = [f for f in (self.to_db_dataframe(r) for r in reports) if not f.empty]
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    # ── 내부 ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _open(content: bytes):
        """calamine 으로 통합 문서를 연다.

        openpyxl 은 `.xlsb`(바이너리 포맷)를 아예 열지 못한다. calamine 은 xlsb 를
        지원하면서 순수 파이썬 리더(pyxlsb)보다 16배 빠르다 — 같은 파일의 RAW 시트
        57만 행이 49.2초 → 3.0초. 모달이 기간 목록을 기다릴 수 있는 수준이 된다.
        날짜 셀도 엑셀 일련번호가 아닌 `datetime.date` 로 돌려준다.
        """
        from python_calamine import CalamineWorkbook

        return CalamineWorkbook.from_filelike(io.BytesIO(content))

    def _aggregate(self, content: bytes):
        """RAW 시트 → (report_date, campaign_type) 로 합산한 DataFrame.

        원본 한 행은 (날짜·캠페인·그룹·기기·이벤트) 단위라 같은 날 같은 매체에 수백 행이
        흩어져 있다. DB 는 (날짜, 매체) 한 행이므로 여기서 합친다.
        """
        import pandas as pd

        wb = self._open(content)
        if SHEET_RAW not in wb.sheet_names:
            raise ValueError(f"'{SHEET_RAW}' 시트를 찾을 수 없습니다.")

        rows = wb.get_sheet_by_name(SHEET_RAW).to_python(skip_empty_area=False)
        if len(rows) < 2:
            raise ValueError(f"'{SHEET_RAW}' 시트에 데이터가 없습니다.")

        index = {_norm_header(v): i for i, v in enumerate(rows[0])}
        missing = [name for name in RAW_COLUMNS.values() if name not in index]
        if missing:
            raise ValueError(
                f"'{SHEET_RAW}' 시트에서 필요한 컬럼을 찾을 수 없습니다: {', '.join(missing)}"
            )
        at = {key: index[name] for key, name in RAW_COLUMNS.items()}
        width = len(rows[0])

        records = []
        for row in rows[1:]:
            if len(row) < width:
                continue
            day = _as_date(row[at["date"]])
            if day is None:
                continue
            records.append((
                day,
                label_for(str(row[at["ad_type"]] or "").strip(),
                          str(row[at["platform"]] or "").strip()),
                _num(row[at["impressions"]]), _num(row[at["clicks"]]),
                _num(row[at["cost"]]), _num(row[at["conversions"]]),
                _num(row[at["signup"]]), _num(row[at["purchase"]]),
                _num(row[at["revenue"]]), _num(row[at["apply"]]),
            ))

        if not records:
            raise ValueError(f"'{SHEET_RAW}' 시트에서 읽을 수 있는 행이 없습니다.")

        frame = pd.DataFrame(
            records, columns=["report_date", "campaign_type", *_METRICS]
        )
        frame = frame.groupby(["report_date", "campaign_type"], as_index=False)[
            list(_METRICS)
        ].sum()

        # 집계 후 모든 지표가 0인 조합만 버린다. 집행 전 세팅만 돼 있던 날이나 원본의
        # 0 패딩 행(전체의 4.9%)이 여기서 걸린다.
        #
        # 개별 행 단위로 `노출==0 and 클릭==0` 을 보고 버리면 안 된다 — 전환·매출만
        # 담긴 행이 그 모양이고, 그렇게 걸렀을 때 매출의 98.8% 가 사라진다.
        nonzero = frame[list(_METRICS)].abs().sum(axis=1) > 0
        frame = frame[nonzero].reset_index(drop=True)
        if frame.empty:
            raise ValueError(f"'{SHEET_RAW}' 시트에 실적이 있는 행이 없습니다.")
        return frame.sort_values(["report_date", "campaign_type"]).reset_index(drop=True)

    @staticmethod
    def _days_per_period(frame) -> dict[tuple[int, int], int]:
        """기간별 실적 일수 — 모달의 'N일' 배지. 기간 순서는 날짜순."""
        days: dict[tuple[int, int], set] = {}
        for day in frame["report_date"]:
            days.setdefault((day.year, day.month), set()).add(day)
        return {key: len(value) for key, value in sorted(days.items())}

    def _resolve_periods(self, frame, periods: list[str] | None) -> list[tuple[int, int]]:
        available = list(self._days_per_period(frame))
        if not periods:
            return available
        wanted, unknown = [], []
        for raw in periods:
            parsed = parse_period_label(raw)
            if parsed is None or parsed not in available:
                unknown.append(raw)
            else:
                wanted.append(parsed)
        if unknown:
            raise ValueError(f"'{', '.join(unknown)}' 기간을 파일에서 찾을 수 없습니다.")
        return sorted(set(wanted))

    def _review_comment(self, content: bytes) -> str:
        """`review` 시트의 주간 코멘트를 마크다운으로 모은다.

        레이아웃을 좌표로 박지 않고 "…성과 분석" 머리글을 찾아 바로 아래 칸을 본문으로
        읽는다 — 대행사가 블록을 옮기거나 늘려도 따라간다. 코멘트가 없으면 빈 문자열.
        """
        try:
            wb = self._open(content)
            if SHEET_REVIEW not in wb.sheet_names:
                return ""
            rows = wb.get_sheet_by_name(SHEET_REVIEW).to_python(skip_empty_area=False)
        except Exception:
            logger.exception("review 시트 코멘트를 읽지 못했습니다 (데이터 적재는 계속)")
            return ""

        title = ""
        blocks: list[tuple[str, str]] = []
        for r, row in enumerate(rows):
            for c, cell in enumerate(row):
                text = str(cell or "").strip()
                if not text:
                    continue
                if not title and "comment" in text.lower():
                    title = text.lstrip("■ ").strip()
                if "성과 분석" in text and r + 1 < len(rows):
                    below = rows[r + 1]
                    body = str(below[c] or "").strip() if c < len(below) else ""
                    if body:
                        blocks.append((text.lstrip("■ ").strip(), body))

        if not blocks:
            return ""
        parts = [f"## {title}" if title else "## 주간 코멘트"]
        for heading, body in blocks:
            parts.append(f"### {heading}\n{body.lstrip('■ ').strip()}")
        return "\n\n".join(parts)

    def _build_report(self, frame, year: int, month: int, comment: str) -> dict:
        month_frame = frame[
            [d.year == year and d.month == month for d in frame["report_date"]]
        ]
        days = sorted({d for d in month_frame["report_date"]})
        total_days = _days_in_month(year, month)

        media = {
            label: self._media_sheet(month_frame[month_frame["campaign_type"] == label])
            for label in KNOWN_LABELS
            if (month_frame["campaign_type"] == label).any()
        }

        return {
            "period": period_label(year, month),
            "period_info": {
                "remaining_days": max(total_days - len(days), 0),
                "elapsed_days": len(days),
                "total_days": total_days,
            },
            "sa_total": self._sa_total(frame, year, month),
            # 이 양식에는 매체별 예산 표가 없다 — 예산은 월간 템플릿 summary 시트에만 있다.
            "budget_table": [],
            "comment": comment,
            "daily_total": self._daily_total(month_frame, days),
            "media": media,
        }

    @staticmethod
    def _media_sheet(label_frame) -> dict:
        """한 매체의 일별 표 — `MEDIA_COLUMNS` 순서로 채운다."""
        def line(day, m: dict) -> list:
            imp, clk, cost = m["impressions"], m["clicks"], m["cost"]
            conv, rev = m["conversions"], m["revenue"]
            return [
                day.isoformat() if day else "",
                imp, clk,
                _ratio(clk, imp), _ratio(cost, clk), cost,
                conv, _ratio(conv, clk), _ratio(cost, conv),
                m["signup"], m["purchase"], rev, _ratio(rev, cost), m["apply"],
            ]

        daily = [
            line(row.report_date, {k: getattr(row, k) for k in _METRICS})
            for row in label_frame.itertuples(index=False)
        ]
        totals = {k: float(label_frame[k].sum()) for k in _METRICS}
        return {
            "headers": list(MEDIA_COLUMNS),
            "total": line(None, totals),
            "daily": daily,
        }

    @staticmethod
    def _daily_total(month_frame, days: list[dt.date]) -> list[dict]:
        out = []
        for day in days:
            rows = month_frame[month_frame["report_date"] == day]
            imp = float(rows["impressions"].sum())
            clk = float(rows["clicks"].sum())
            cost = float(rows["cost"].sum())
            conv = float(rows["conversions"].sum())
            out.append({
                "date": day.isoformat(),
                "impressions": imp, "clicks": clk,
                "ctr": _ratio(clk, imp), "cpc": _ratio(cost, clk), "cost": cost,
                "total_conv": conv,
                "conv_rate": _ratio(conv, clk), "conv_cost": _ratio(cost, conv),
            })
        return out

    def _sa_total(self, frame, year: int, month: int) -> dict:
        """전년/전월/당월 비교 행 — 한 파일에 전 기간이 있으니 직접 계산한다.

        월간 템플릿은 이 값을 시트의 수식 캐시에서 읽지만, 여기서는 같은 파일 안의
        다른 달을 그대로 합쳐 쓸 수 있다. 주차 단위 비교(전주/금주/WoW)는 이 양식의
        주차 정의(`주차` 컬럼)가 보고서 작성 주 기준이라 월 리포트에 섞으면 오해를
        부르므로 넣지 않는다.
        """
        def totals(y: int, m: int) -> dict:
            sel = frame[[d.year == y and d.month == m for d in frame["report_date"]]]
            return {k: float(sel[k].sum()) for k in _METRICS}

        current = totals(year, month)
        prev_month = totals(year - 1, 12) if month == 1 else totals(year, month - 1)
        prev_year = totals(year - 1, month)

        rows = [
            self._sa_row("전년", prev_year),
            self._sa_row("전월", prev_month),
            self._sa_row("당월", current),
            self._sa_delta("YOY", current, prev_year),
            self._sa_delta("MOM", current, prev_month),
        ]
        return {"headers": list(MEDIA_COLUMNS), "rows": rows}

    @staticmethod
    def _sa_row(label: str, m: dict) -> dict:
        imp, clk, cost = m["impressions"], m["clicks"], m["cost"]
        conv, rev, pur = m["conversions"], m["revenue"], m["purchase"]
        return {
            "label": label, "date": "",
            "impressions": imp, "clicks": clk,
            "ctr": _ratio(clk, imp), "cpc": _ratio(cost, clk),
            "cost_vat": cost, "cost_markup": 0.0,
            "total_conv": conv, "conv_rate": _ratio(conv, clk), "conv_cost": _ratio(cost, conv),
            "total_conv_ex": conv, "conv_rate_ex": _ratio(conv, clk),
            "conv_cost_ex": _ratio(cost, conv),
            "signup": m["signup"], "signup_rate": _ratio(m["signup"], clk),
            "purchase": pur, "purchase_rate": _ratio(pur, clk),
            "revenue": rev, "roas": _ratio(rev, cost),
            "revenue_per_purchase": _ratio(rev, pur),
        }

    @classmethod
    def _sa_delta(cls, label: str, current: dict, base: dict) -> dict:
        """증감률 행 — 기준이 0이면 0 으로 둔다(무한대를 화면에 흘리지 않는다)."""
        row = cls._sa_row(label, {k: 0.0 for k in _METRICS})
        row["label"] = label
        for key, now in (
            ("impressions", "impressions"), ("clicks", "clicks"),
            ("cost_vat", "cost"), ("total_conv", "conversions"),
            ("signup", "signup"), ("purchase", "purchase"), ("revenue", "revenue"),
        ):
            row[key] = _ratio(current[now] - base[now], base[now])
        return row


def _ratio(numerator: float, denominator: float) -> float:
    """0 나눗셈을 0 으로 흘리는 비율 계산 — 엑셀의 IFERROR(.., ) 와 같은 취급."""
    if not denominator:
        return 0.0
    value = numerator / denominator
    return 0.0 if (math.isnan(value) or math.isinf(value)) else value


def _days_in_month(year: int, month: int) -> int:
    import calendar

    return calendar.monthrange(year, month)[1]
