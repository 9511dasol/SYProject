"""월간 리포트에 넣을 키워드 순위 현황 (M6).

순위 모니터링을 따로 떨어진 화면으로 두지 않고, **매달 나가는 리포트 안에서** 보이게
한다. 리포트를 받는 사람은 보통 그 메일 하나만 열어 보기 때문이다.

무엇을 싣는가
────────────
목표를 벗어난 키워드만 싣는다. 잘 되고 있는 키워드까지 나열하면 리포트가 길어지고,
정작 손봐야 할 것이 묻힌다. 각 행에는 "되돌리려면 클릭당 얼마"(M5 예상 입찰가)를
붙여, 읽는 사람이 바로 판단할 수 있게 한다.

왜 발송 시점 기준인가
───────────────────
리포트 본문은 지난달 실적이지만 순위는 '지금' 상태다. 섞이면 오해를 부르므로
템플릿에서 기준 시점을 따로 밝힌다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

from app.core.settings import settings
from app.repositories.keyword_watch_repo import KeywordWatchRepository
from app.services.rank.base import RankProviderError
from app.services.rank.bid_estimate import BidEstimateService

logger = logging.getLogger(__name__)


@dataclass
class RankReportRow:
    keyword: str
    device: str
    target_rank: float
    current_rank: float | None
    stat_date: date | None
    breach_streak: int
    # 목표 순위를 지키는 데 드는 예상 클릭당 비용
    target_bid_pc: int | None = None
    target_bid_mobile: int | None = None


@dataclass
class RankReportSection:
    rows: list[RankReportRow] = field(default_factory=list)
    total_watched: int = 0
    breached_total: int = 0
    # 상한에 걸려 싣지 못한 수
    omitted: int = 0

    @property
    def has_content(self) -> bool:
        return self.total_watched > 0


def build_rank_section(
    db: Session,
    *,
    with_estimates: bool = True,
    # 상한을 넘치는 건 "외 N건"으로 알린다(조용히 자르지 않는다). 외부 API 를
    # 행마다 부르므로 상한이 필요하고, 값은 설정(RANK_REPORT_MAX_ROWS)으로 조정한다.
    max_rows: int | None = None,
    estimator: BidEstimateService | None = None,
) -> RankReportSection:
    """리포트용 순위 현황을 만든다. 실패해도 예외를 밖으로 내지 않는다 —
    순위 한 조각 때문에 월간 리포트 전체가 안 나가면 안 된다."""
    if max_rows is None:
        max_rows = settings.RANK_REPORT_MAX_ROWS
    repo = KeywordWatchRepository(db)
    watches = [w for w in repo.list_all() if w.status == "active"]
    section = RankReportSection(total_watched=len(watches))
    if not watches:
        return section

    latest = repo.latest_snapshots([w.id for w in watches])
    breached = [w for w in watches if w.breach_streak >= w.breaches_required]
    section.breached_total = len(breached)

    # 오래 벗어나 있는 것부터 — 가장 손이 급한 순서다.
    breached.sort(key=lambda w: (-w.breach_streak, w.keyword))
    shown = breached[:max_rows]
    section.omitted = len(breached) - len(shown)

    service = estimator or (BidEstimateService() if with_estimates else None)
    use_estimates = bool(service and service.is_configured)

    for watch in shown:
        snapshot = latest.get(watch.id)
        row = RankReportRow(
            keyword=watch.keyword,
            device=watch.device,
            target_rank=watch.target_rank,
            current_rank=snapshot.avg_rank if snapshot else None,
            stat_date=snapshot.stat_date if snapshot else None,
            breach_streak=watch.breach_streak,
        )
        if use_estimates:
            _attach_estimate(service, watch, row)
        section.rows.append(row)

    return section


def _attach_estimate(service: BidEstimateService, watch, row: RankReportRow) -> None:
    """목표 순위의 예상 입찰가를 붙인다. 못 받으면 비워 둔다 — 리포트는 나가야 한다."""
    target = max(1, int(round(watch.target_rank)))
    try:
        estimate = service.estimate(watch.keyword, watch.device, target)
    except RankProviderError as exc:
        logger.warning("리포트 예상 입찰가 생략 (%s): %s", watch.keyword, exc.code)
        return
    found = next((r for r in estimate.rows if r.position == target), None)
    if found is not None:
        row.target_bid_pc = found.pc
        row.target_bid_mobile = found.mobile
