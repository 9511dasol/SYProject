from dataclasses import dataclass, field

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.marketing_model import MarketingData


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
    conversions: int = 0
    revenue: float = 0.0
    ctr: float = 0.0
    cpc: float = 0.0
    conv_rate: float = 0.0
    conv_cost: float = 0.0
    roas: float = 0.0


@dataclass
class MediaComparison:
    campaign_type: str
    curr: MediaKPI = field(default_factory=lambda: MediaKPI(""))
    prev: MediaKPI = field(default_factory=lambda: MediaKPI(""))
    cost_chg: float = 0.0
    conv_chg: float = 0.0
    revenue_chg: float = 0.0


@dataclass
class PeriodComparison:
    curr_year: int
    curr_month: int
    prev_year: int
    prev_month: int
    by_media: list[MediaComparison] = field(default_factory=list)
    # 전체 합계
    curr_cost: float = 0.0
    prev_cost: float = 0.0
    curr_conversions: int = 0
    prev_conversions: int = 0
    curr_revenue: float = 0.0
    prev_revenue: float = 0.0
    cost_chg: float = 0.0
    conv_chg: float = 0.0
    revenue_chg: float = 0.0


def _query_kpis(db: Session, year: int, month: int) -> dict[str, MediaKPI]:
    rows = (
        db.query(
            MarketingData.campaign_type,
            func.sum(MarketingData.impressions).label("impressions"),
            func.sum(MarketingData.clicks).label("clicks"),
            func.sum(MarketingData.cost).label("cost"),
            func.sum(MarketingData.conversions).label("conversions"),
            func.sum(MarketingData.conversion_revenue).label("revenue"),
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
        conv = int(r.conversions or 0)
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
    ) -> PeriodComparison:
        curr_map = _query_kpis(self.db, curr_year, curr_month)
        prev_map = _query_kpis(self.db, prev_year, prev_month)

        all_types = sorted(set(curr_map) | set(prev_map))
        by_media: list[MediaComparison] = []

        for ct in all_types:
            curr = curr_map.get(ct, MediaKPI(ct))
            prev = prev_map.get(ct, MediaKPI(ct))
            by_media.append(
                MediaComparison(
                    campaign_type=ct,
                    curr=curr,
                    prev=prev,
                    cost_chg=_safe_pct(curr.cost, prev.cost),
                    conv_chg=_safe_pct(curr.conversions, prev.conversions),
                    revenue_chg=_safe_pct(curr.revenue, prev.revenue),
                )
            )

        curr_cost = sum(k.cost for k in curr_map.values())
        prev_cost = sum(k.cost for k in prev_map.values())
        curr_conv = sum(k.conversions for k in curr_map.values())
        prev_conv = sum(k.conversions for k in prev_map.values())
        curr_rev = sum(k.revenue for k in curr_map.values())
        prev_rev = sum(k.revenue for k in prev_map.values())

        return PeriodComparison(
            curr_year=curr_year,
            curr_month=curr_month,
            prev_year=prev_year,
            prev_month=prev_month,
            by_media=by_media,
            curr_cost=curr_cost,
            prev_cost=prev_cost,
            curr_conversions=curr_conv,
            prev_conversions=prev_conv,
            curr_revenue=curr_rev,
            prev_revenue=prev_rev,
            cost_chg=_safe_pct(curr_cost, prev_cost),
            conv_chg=_safe_pct(curr_conv, prev_conv),
            revenue_chg=_safe_pct(curr_rev, prev_rev),
        )
