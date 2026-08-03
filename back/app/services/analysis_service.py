from dataclasses import dataclass, field

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.marketing_model import MarketingData, resolve_total_conv


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
    cost_chg: float = 0.0
    conv_chg: float = 0.0
    revenue_chg: float = 0.0
    # 전전월 → 전월 변화율 (직전 구간)
    prev_cost_chg: float = 0.0
    prev_conv_chg: float = 0.0
    prev_revenue_chg: float = 0.0
    cost_trend: str = ""
    conv_trend: str = ""
    revenue_trend: str = ""
    # 이 매체가 전전월에는 아예 없었는지 (신규 매체 → 추세 판단 불가)
    prev2_missing: bool = False


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
        .filter(
            extract("year", MarketingData.report_date) == year,
            extract("month", MarketingData.report_date) == month,
        )
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

    def compare(
        self,
        curr_year: int,
        curr_month: int,
        prev_year: int,
        prev_month: int,
        prev2_year: int | None = None,
        prev2_month: int | None = None,
    ) -> PeriodComparison:
        """당월·전월·전전월 3개월을 비교한다.

        prev2 를 주지 않으면 전월의 직전 달로 잡는다. 전전월 데이터가 DB에 없으면
        has_prev2=False 가 되고, 코멘트 프롬프트는 3개월 블록을 생략해 2개월 비교로 돌아간다.
        """
        if prev2_year is None or prev2_month is None:
            prev2_year, prev2_month = (
                (prev_year - 1, 12) if prev_month == 1 else (prev_year, prev_month - 1)
            )

        curr_map = _query_kpis(self.db, curr_year, curr_month)
        prev_map = _query_kpis(self.db, prev_year, prev_month)
        prev2_map = _query_kpis(self.db, prev2_year, prev2_month)

        all_types = sorted(set(curr_map) | set(prev_map) | set(prev2_map))
        by_media: list[MediaComparison] = []

        for ct in all_types:
            curr = curr_map.get(ct, MediaKPI(ct))
            prev = prev_map.get(ct, MediaKPI(ct))
            prev2 = prev2_map.get(ct, MediaKPI(ct))

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
                    cost_chg=cost_chg,
                    conv_chg=conv_chg,
                    revenue_chg=rev_chg,
                    prev_cost_chg=p_cost_chg,
                    prev_conv_chg=p_conv_chg,
                    prev_revenue_chg=p_rev_chg,
                    cost_trend=_trend(cost_chg, p_cost_chg),
                    conv_trend=_trend(conv_chg, p_conv_chg),
                    revenue_trend=_trend(rev_chg, p_rev_chg),
                    prev2_missing=ct not in prev2_map,
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

        cost_chg = _safe_pct(curr_cost, prev_cost)
        conv_chg = _safe_pct(curr_conv, prev_conv)
        rev_chg = _safe_pct(curr_rev, prev_rev)
        p_cost_chg = _safe_pct(prev_cost, prev2_cost)
        p_conv_chg = _safe_pct(prev_conv, prev2_conv)
        p_rev_chg = _safe_pct(prev_rev, prev2_rev)

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
        )
