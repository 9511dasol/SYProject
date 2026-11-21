from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.marketing_model import MarketingData, in_month, resolve_total_conv


def _safe_pct(new: float, old: float) -> float:
    """전기 대비 변화율(%) — 0 제수는 0 반환"""
    if old == 0:
        return 0.0
    return round((new - old) / old * 100, 2)


def _safe_div(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


@dataclass
class MediaKPI:
    campaign_type: str
    impressions: int = 0
    clicks: int = 0
    cost: float = 0.0
    # 구글은 전환수가 소수로 온다 (하루 66.38건) — 정수로 두면 코멘트 수치가 어긋난다
    conversions: float = 0.0
    revenue: float = 0.0
    ctr: float = 0.0
    cpc: float = 0.0
    conv_rate: float = 0.0
    conv_cost: float = 0.0
    roas: float = 0.0


def _trend(now_chg: float, prev_chg: float) -> str:
    """2개월치 변화율로 추세를 한 단어로 요약.

    2개월 비교만으로는 '진짜 성장'과 '급락 후 회복'이 똑같이 +30%로 보인다.
    직전 구간의 변화율을 같이 봐야 방향을 구분할 수 있다.
    """
    if now_chg > 0 and prev_chg > 0:
        return "2개월 연속 증가"
    if now_chg < 0 and prev_chg < 0:
        return "2개월 연속 감소"
    if now_chg > 0 and prev_chg < 0:
        return "반등"
    if now_chg < 0 and prev_chg > 0:
        return "조정"
    return "보합"


@dataclass
class MediaComparison:
    campaign_type: str
    curr: MediaKPI = field(default_factory=lambda: MediaKPI(""))
    prev: MediaKPI = field(default_factory=lambda: MediaKPI(""))
    prev2: MediaKPI = field(default_factory=lambda: MediaKPI(""))
    yoy: MediaKPI = field(default_factory=lambda: MediaKPI(""))
    cost_chg: float = 0.0
    conv_chg: float = 0.0
    revenue_chg: float = 0.0
    # 전전월 → 전월 변화율 (직전 구간)
    prev_cost_chg: float = 0.0
    prev_conv_chg: float = 0.0
    prev_revenue_chg: float = 0.0
    # 전년 동월 → 당월 변화율
    yoy_cost_chg: float = 0.0
    yoy_conv_chg: float = 0.0
    yoy_revenue_chg: float = 0.0
    cost_trend: str = ""
    conv_trend: str = ""
    revenue_trend: str = ""
    # 이 매체가 전전월에는 아예 없었는지 (신규 매체 → 추세 판단 불가)
    prev2_missing: bool = False
    # 이 매체가 전년 동월에는 아예 없었는지 (신규 매체 → YoY 비교 불가)
    yoy_missing: bool = True


@dataclass
class PeriodComparison:
    curr_year: int
    curr_month: int
    prev_year: int
    prev_month: int
    prev2_year: int = 0
    prev2_month: int = 0
    by_media: list[MediaComparison] = field(default_factory=list)
    # 전체 합계
    curr_cost: float = 0.0
    prev_cost: float = 0.0
    prev2_cost: float = 0.0
    curr_conversions: float = 0.0
    prev_conversions: float = 0.0
    prev2_conversions: float = 0.0
    curr_revenue: float = 0.0
    prev_revenue: float = 0.0
    prev2_revenue: float = 0.0
    cost_chg: float = 0.0
    conv_chg: float = 0.0
    revenue_chg: float = 0.0
    # 전전월 → 전월 변화율과 그로부터 판정한 추세
    prev_cost_chg: float = 0.0
    prev_conv_chg: float = 0.0
    prev_revenue_chg: float = 0.0
    cost_trend: str = ""
    conv_trend: str = ""
    revenue_trend: str = ""
    # 전전월 데이터가 DB에 있는지 — 없으면 프롬프트에서 3개월 블록을 통째로 생략한다
    has_prev2: bool = False
    # ── 전년 동월(YoY) ────────────────────────────────────────────────────────
    # 광고는 계절성이 강해(10월 성수기 등) 전월 비교만으로는 성과 판단이 왜곡된다.
    # yoy_* 가 채워지면 프롬프트에 전년 동월 블록이 붙는다.
    yoy_year: int = 0
    yoy_month: int = 0
    yoy_cost: float = 0.0
    yoy_conversions: float = 0.0
    yoy_revenue: float = 0.0
    yoy_cost_chg: float = 0.0
    yoy_conv_chg: float = 0.0
    yoy_revenue_chg: float = 0.0
    has_yoy: bool = False
    # 비교한 달이 정확히 그 달인지 — 데이터가 없어 주변 달로 대신했으면 False.
    # 프롬프트가 "전년 동월"이라고 말해도 되는지를 이 플래그로 정한다.
    prev_is_exact: bool = True
    yoy_is_exact: bool = True


def _ordinal(year: int, month: int) -> int:
    return year * 12 + month


def _from_ordinal(value: int) -> tuple[int, int]:
    year, month = divmod(value - 1, 12)
    return year, month + 1


@dataclass(frozen=True)
class CommentPeriods:
    """코멘트가 비교할 기간 — 전월과 전년 동월, 그리고 각각이 '정확한 그 달'인지.

    달력상의 전월·전년 동월에 데이터가 없으면 가장 가까운 보유 월로 대신한다.
    데이터가 띄엄띄엄 쌓인 초기 운영 단계에서도 비교가 비지 않게 하기 위함인데,
    대신한 사실은 is_exact 플래그로 프롬프트까지 전달해 "전년 동월"이라고
    말하지 않게 한다 — 숫자는 맞는데 라벨이 거짓이면 코멘트 전체가 의심받는다.
    """

    prev_year: int
    prev_month: int
    prev_is_exact: bool
    yoy_year: int | None
    yoy_month: int | None
    yoy_is_exact: bool


def _query_kpis(db: Session, year: int, month: int) -> dict[str, MediaKPI]:
    rows = (
        db.query(
            MarketingData.campaign_type,
            func.sum(MarketingData.impressions).label("impressions"),
            func.sum(MarketingData.clicks).label("clicks"),
            func.sum(MarketingData.cost).label("cost"),
            func.sum(MarketingData.conversions).label("conversions"),
            func.sum(MarketingData.conversion_revenue).label("revenue"),
            func.sum(MarketingData.signup).label("signup"),
            func.sum(MarketingData.purchase).label("purchase"),
            func.sum(MarketingData.apply).label("apply"),
        )
        .filter(in_month(year, month))
        .group_by(MarketingData.campaign_type)
        .all()
    )

    result: dict[str, MediaKPI] = {}
    for r in rows:
        imp = int(r.impressions or 0)
        clk = int(r.clicks or 0)
        cost = float(r.cost or 0)
        conv = round(resolve_total_conv(r.conversions, r.signup, r.purchase, r.apply), 2)
        rev = float(r.revenue or 0)
        result[r.campaign_type] = MediaKPI(
            campaign_type=r.campaign_type,
            impressions=imp,
            clicks=clk,
            cost=cost,
            conversions=conv,
            revenue=rev,
            ctr=_safe_div(clk, imp),
            cpc=_safe_div(cost, clk),
            conv_rate=_safe_div(conv, clk),
            conv_cost=_safe_div(cost, conv),
            roas=_safe_div(rev, cost),
        )
    return result


class AnalysisService:
    def __init__(self, db: Session):
        self.db = db

    def available_periods(self) -> list[tuple[int, int]]:
        """데이터가 있는 (연, 월) 목록 — 오래된 순."""
        rows = (
            self.db.query(MarketingData.report_date)
            .distinct()
            .all()
        )
        return sorted({(r.report_date.year, r.report_date.month) for r in rows})

    def resolve_comment_periods(self, curr_year: int, curr_month: int) -> CommentPeriods:
        """코멘트가 비교할 전월·전년 동월을 정한다. 없으면 가장 가까운 보유 월로.

        - 전월: 달력상 전월에 데이터가 있으면 그 달. 없으면 당월보다 앞선 달 중
          가장 최근 달(= 직전 보유 월). 앞선 데이터가 아예 없으면 달력상 전월을
          그대로 쓴다(빈 비교 — 기존 동작과 같다).
        - 전년 동월: 정확히 1년 전 달이 있으면 그 달. 없으면 **전월보다 더 오래된**
          보유 월 중 1년 전과 가장 가까운 달. 전월과 겹치는 후보는 제외한다 —
          같은 달을 "전월"과 "전년 동월"로 두 번 보여주면 비교가 아니라 중복이다.
          후보가 없으면 None(프롬프트에서 YoY 블록 생략).
        """
        curr = _ordinal(curr_year, curr_month)
        available = {_ordinal(y, m) for y, m in self.available_periods()}

        calendar_prev = curr - 1
        if calendar_prev in available:
            prev, prev_is_exact = calendar_prev, True
        else:
            earlier = [o for o in available if o < curr]
            if earlier:
                prev, prev_is_exact = max(earlier), False
            else:
                prev, prev_is_exact = calendar_prev, True  # 대신할 달도 없다 — 빈 비교

        yoy_target = curr - 12
        yoy: int | None
        if yoy_target in available and yoy_target < prev:
            yoy, yoy_is_exact = yoy_target, True
        else:
            # 전월보다 오래된 달만 후보 — 거리가 같으면 더 오래된 쪽(작년에 가까운 쪽)
            candidates = [o for o in available if o < prev]
            if candidates:
                yoy = min(candidates, key=lambda o: (abs(o - yoy_target), o))
                yoy_is_exact = yoy == yoy_target
            else:
                yoy, yoy_is_exact = None, True

        prev_y, prev_m = _from_ordinal(prev)
        yoy_y, yoy_m = _from_ordinal(yoy) if yoy is not None else (None, None)
        return CommentPeriods(
            prev_year=prev_y,
            prev_month=prev_m,
            prev_is_exact=prev_is_exact,
            yoy_year=yoy_y,
            yoy_month=yoy_m,
            yoy_is_exact=yoy_is_exact,
        )

    def compare(
        self,
        curr_year: int,
        curr_month: int,
        prev_year: int,
        prev_month: int,
        prev2_year: int | None = None,
        prev2_month: int | None = None,
        yoy_year: int | None = None,
        yoy_month: int | None = None,
    ) -> PeriodComparison:
        """당월·전월·전전월 3개월을 비교한다.

        prev2 를 주지 않으면 전월의 직전 달로 잡는다. 전전월 데이터가 DB에 없으면
        has_prev2=False 가 되고, 코멘트 프롬프트는 3개월 블록을 생략해 2개월 비교로 돌아간다.

        yoy_year/yoy_month 를 주면 그 달(보통 전년 동월)과의 비교도 함께 채운다 —
        광고는 계절성이 강해 전월 비교만으로는 판단이 왜곡되기 때문이다. 주지 않으면
        has_yoy=False 로 기존과 완전히 같게 동작한다(리포트 메일 경로는 그대로).
        """
        if prev2_year is None or prev2_month is None:
            prev2_year, prev2_month = (
                (prev_year - 1, 12) if prev_month == 1 else (prev_year, prev_month - 1)
            )

        curr_map = _query_kpis(self.db, curr_year, curr_month)
        prev_map = _query_kpis(self.db, prev_year, prev_month)
        prev2_map = _query_kpis(self.db, prev2_year, prev2_month)
        yoy_requested = yoy_year is not None and yoy_month is not None
        yoy_map = _query_kpis(self.db, yoy_year, yoy_month) if yoy_requested else {}

        all_types = sorted(set(curr_map) | set(prev_map) | set(prev2_map) | set(yoy_map))
        by_media: list[MediaComparison] = []

        for ct in all_types:
            curr = curr_map.get(ct, MediaKPI(ct))
            prev = prev_map.get(ct, MediaKPI(ct))
            prev2 = prev2_map.get(ct, MediaKPI(ct))
            yoy = yoy_map.get(ct, MediaKPI(ct))

            cost_chg = _safe_pct(curr.cost, prev.cost)
            conv_chg = _safe_pct(curr.conversions, prev.conversions)
            rev_chg = _safe_pct(curr.revenue, prev.revenue)
            p_cost_chg = _safe_pct(prev.cost, prev2.cost)
            p_conv_chg = _safe_pct(prev.conversions, prev2.conversions)
            p_rev_chg = _safe_pct(prev.revenue, prev2.revenue)

            by_media.append(
                MediaComparison(
                    campaign_type=ct,
                    curr=curr,
                    prev=prev,
                    prev2=prev2,
                    yoy=yoy,
                    cost_chg=cost_chg,
                    conv_chg=conv_chg,
                    revenue_chg=rev_chg,
                    prev_cost_chg=p_cost_chg,
                    prev_conv_chg=p_conv_chg,
                    prev_revenue_chg=p_rev_chg,
                    yoy_cost_chg=_safe_pct(curr.cost, yoy.cost),
                    yoy_conv_chg=_safe_pct(curr.conversions, yoy.conversions),
                    yoy_revenue_chg=_safe_pct(curr.revenue, yoy.revenue),
                    cost_trend=_trend(cost_chg, p_cost_chg),
                    conv_trend=_trend(conv_chg, p_conv_chg),
                    revenue_trend=_trend(rev_chg, p_rev_chg),
                    prev2_missing=ct not in prev2_map,
                    yoy_missing=ct not in yoy_map,
                )
            )

        curr_cost = sum(k.cost for k in curr_map.values())
        prev_cost = sum(k.cost for k in prev_map.values())
        prev2_cost = sum(k.cost for k in prev2_map.values())
        # 소수 전환수가 그대로 흘러가면 프롬프트에 66.38000000000001 같은 값이 박힌다
        curr_conv = round(sum(k.conversions for k in curr_map.values()), 2)
        prev_conv = round(sum(k.conversions for k in prev_map.values()), 2)
        prev2_conv = round(sum(k.conversions for k in prev2_map.values()), 2)
        curr_rev = sum(k.revenue for k in curr_map.values())
        prev_rev = sum(k.revenue for k in prev_map.values())
        prev2_rev = sum(k.revenue for k in prev2_map.values())

        yoy_cost = sum(k.cost for k in yoy_map.values())
        yoy_conv = round(sum(k.conversions for k in yoy_map.values()), 2)
        yoy_rev = sum(k.revenue for k in yoy_map.values())

        cost_chg = _safe_pct(curr_cost, prev_cost)
        conv_chg = _safe_pct(curr_conv, prev_conv)
        rev_chg = _safe_pct(curr_rev, prev_rev)
        p_cost_chg = _safe_pct(prev_cost, prev2_cost)
        p_conv_chg = _safe_pct(prev_conv, prev2_conv)
        p_rev_chg = _safe_pct(prev_rev, prev2_rev)

        # "정확한 그 달"인지 — 달력 계산으로 판별한다. 대신한 달이면 프롬프트가
        # "전월"/"전년 동월" 대신 실제 연·월을 밝혀 말한다.
        prev_is_exact = _ordinal(prev_year, prev_month) == _ordinal(curr_year, curr_month) - 1
        yoy_is_exact = (
            yoy_requested
            and _ordinal(yoy_year, yoy_month) == _ordinal(curr_year, curr_month) - 12
        )

        return PeriodComparison(
            curr_year=curr_year,
            curr_month=curr_month,
            prev_year=prev_year,
            prev_month=prev_month,
            prev2_year=prev2_year,
            prev2_month=prev2_month,
            by_media=by_media,
            curr_cost=curr_cost,
            prev_cost=prev_cost,
            prev2_cost=prev2_cost,
            curr_conversions=curr_conv,
            prev_conversions=prev_conv,
            prev2_conversions=prev2_conv,
            curr_revenue=curr_rev,
            prev_revenue=prev_rev,
            prev2_revenue=prev2_rev,
            cost_chg=cost_chg,
            conv_chg=conv_chg,
            revenue_chg=rev_chg,
            prev_cost_chg=p_cost_chg,
            prev_conv_chg=p_conv_chg,
            prev_revenue_chg=p_rev_chg,
            cost_trend=_trend(cost_chg, p_cost_chg),
            conv_trend=_trend(conv_chg, p_conv_chg),
            revenue_trend=_trend(rev_chg, p_rev_chg),
            has_prev2=bool(prev2_map),
            yoy_year=yoy_year or 0,
            yoy_month=yoy_month or 0,
            yoy_cost=yoy_cost,
            yoy_conversions=yoy_conv,
            yoy_revenue=yoy_rev,
            yoy_cost_chg=_safe_pct(curr_cost, yoy_cost),
            yoy_conv_chg=_safe_pct(curr_conv, yoy_conv),
            yoy_revenue_chg=_safe_pct(curr_rev, yoy_rev),
            has_yoy=bool(yoy_map),
            prev_is_exact=prev_is_exact,
            yoy_is_exact=yoy_is_exact,
        )
