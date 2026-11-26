"""키워드 순위 모니터링 — 관측값 적재와 목표 이탈 판정.

판정이 이 기능의 심장이라 순수 함수로 분리해 두었다(is_breached / compute_streak).
적재(ingest_observations)는 어떤 공급자가 와도 같은 경로를 지난다: 관측값을
감시 키워드에 매칭 → 스냅샷 upsert(멱등) → 이력 기준으로 연속 이탈 재계산.

연속 이탈을 "+1 누적"이 아니라 이력에서 매번 재계산하는 이유: 같은 날짜 보고서를
다시 올리거나 지난 날짜를 늦게 올려도 숫자가 틀어지지 않는다 — 업로드가 몇 번이든
결과는 이력이 말하는 그대로다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.repositories.keyword_watch_repo import KeywordWatchRepository
from app.services.rank.base import RankObservation
from app.services.rank.report_parser import normalize_keyword

# 연속 이탈 재계산 때 보는 최근 이력 수. breaches_required 상한(10)보다 넉넉하면 된다.
_STREAK_WINDOW = 30


def is_breached(
    watch: KeywordWatch, avg_rank: float | None, impressions: int
) -> bool:
    """하루치 관측이 목표 이탈인지 — 알림(M3)도 이 판정 하나를 쓴다."""
    if avg_rank is None or impressions <= 0:
        return watch.alert_on_no_impression
    return avg_rank > watch.target_rank + watch.tolerance


def compute_streak(
    watch: KeywordWatch, snapshots_desc: list[KeywordRankSnapshot]
) -> int:
    """최신 날짜부터 거슬러 세는 연속 이탈 횟수. 이탈 아닌 날을 만나면 멈춘다."""
    streak = 0
    for snap in snapshots_desc:
        if not is_breached(watch, snap.avg_rank, snap.impressions):
            break
        streak += 1
    return streak


def recompute_streak(db: Session, watch: KeywordWatch) -> None:
    """저장된 이력으로 연속 이탈을 다시 센다.

    breach_streak 은 target_rank·tolerance·alert_on_no_impression 으로부터 만들어진
    값이라, 그 설정을 고치면 같이 다시 계산해야 한다. 그러지 않으면 목표를 3위에서
    50위로 늘려도 "하락" 뱃지가 그대로 남고, 반대로 목표를 조여도 다음 업로드
    전까지는 아무 일도 일어나지 않는다.
    """
    repo = KeywordWatchRepository(db)
    watch.breach_streak = (
        compute_streak(watch, repo.recent_desc(watch.id, _STREAK_WINDOW))
        if watch.status == "active"
        else watch.breach_streak
    )


@dataclass
class IngestSummary:
    stat_date: date
    matched_watches: int = 0
    inserted: int = 0
    updated: int = 0
    unmatched_keywords: list[str] = field(default_factory=list)
    watches_no_data: list[str] = field(default_factory=list)


def _merge_observations(
    rows: list[RankObservation],
) -> tuple[float | None, int, int]:
    """한 감시 키워드에 매칭된 관측값 여러 건(PC+모바일 등)을 하나로 합친다."""
    imp = sum(r.impressions for r in rows)
    clk = sum(r.clicks for r in rows)
    weighted = [(r.avg_rank, r.impressions) for r in rows if r.avg_rank is not None]
    if not weighted:
        return None, imp, clk
    w_imp = sum(w for _, w in weighted)
    if w_imp > 0:
        return sum(rank * w for rank, w in weighted) / w_imp, imp, clk
    return sum(rank for rank, _ in weighted) / len(weighted), imp, clk


def _rows_for_watch(
    watch: KeywordWatch, rows: list[RankObservation]
) -> list[RankObservation]:
    """디바이스 매칭 — 'all' 감시는 전부, pc/mobile 감시는 해당 디바이스만.

    보고서에 디바이스 컬럼이 없으면 행이 "all"로 오는데, 이때는 pc/mobile 감시에도
    쓴다 — 구분할 수 없는 데이터라도 없는 것보다는 낫고, 출처가 기록에 남는다.
    """
    if watch.device == "all":
        return rows
    matched = [r for r in rows if r.device == watch.device]
    return matched or [r for r in rows if r.device == "all"]


def ingest_observations(
    db: Session,
    observations: list[RankObservation],
    *,
    stat_date: date,
    source: str = "upload",
    company_id: int | None = None,
) -> IngestSummary:
    """관측값을 스냅샷으로 적재하고 감시 행의 연속 이탈을 갱신한다. commit 은 호출부가 한다.

    company_id 가 있으면(업로드 등 요청 경로) 그 기업의 감시에만 매칭한다 — 없으면
    A기업 보고서의 키워드가 B기업 감시에 꽂히는 교차 오염이 생긴다. 크론(전 기업
    수집)은 None 으로 전체를 돌되, 스냅샷 소속은 각 감시의 company_id 를 따른다.
    """
    repo = KeywordWatchRepository(db, company_id)
    watches = repo.list_all()
    summary = IngestSummary(stat_date=stat_date)

    by_keyword: dict[str, list[RankObservation]] = {}
    for obs in observations:
        by_keyword.setdefault(normalize_keyword(obs.keyword), []).append(obs)

    matched_keywords: set[str] = set()
    now = datetime.now(timezone.utc)

    # 1단계 — 매칭만 먼저 끝낸다. 스냅샷 조회·이력 조회를 감시마다 반복하지 않고
    # 매칭된 것들에 대해 한 번씩만 날리기 위해서다.
    # (예전에는 감시 하나마다 get_snapshot 1쿼리 + recent_desc 1쿼리가 돌아,
    #  감시 N건이면 업로드마다 1+2N 쿼리였다.)
    matched: list[tuple[KeywordWatch, list[RankObservation]]] = []
    for watch in watches:
        key = normalize_keyword(watch.keyword)
        rows = _rows_for_watch(watch, by_keyword.get(key, []))
        if not rows:
            if watch.status == "active":
                summary.watches_no_data.append(watch.keyword)
                # 확인은 했다 — 이 줄이 없으면 매번 평가를 돌려도 "한 번도 확인 안 함"으로 남는다.
                watch.last_checked_at = now
            continue
        matched_keywords.add(key)
        summary.matched_watches += 1
        matched.append((watch, rows))

    # 2단계 — 같은 날짜·출처의 기존 스냅샷을 한 쿼리로 가져와 upsert 한다.
    existing_by_watch = repo.get_snapshots_bulk(
        [w.id for w, _ in matched], stat_date, source
    )
    for watch, rows in matched:
        avg_rank, impressions, clicks = _merge_observations(rows)
        existing = existing_by_watch.get(watch.id)
        if existing is None:
            db.add(
                KeywordRankSnapshot(
                    company_id=watch.company_id,
                    watch_id=watch.id,
                    stat_date=stat_date,
                    avg_rank=avg_rank,
                    impressions=impressions,
                    clicks=clicks,
                    source=source,
                )
            )
            summary.inserted += 1
        else:
            existing.avg_rank = avg_rank
            existing.impressions = impressions
            existing.clicks = clicks
            existing.collected_at = now
            summary.updated += 1

        watch.last_checked_at = now

    # 3단계 — 새 스냅샷이 조회에 보이도록 한 번만 flush 하고, 감시별 최근 이력을
    # 한 쿼리로 끌어와 연속 이탈을 재계산한다.
    if matched:
        db.flush()
        history_by_watch = repo.recent_desc_bulk(
            [w.id for w, _ in matched], _STREAK_WINDOW
        )
        for watch, _ in matched:
            if watch.status == "active":
                watch.breach_streak = compute_streak(
                    watch, history_by_watch.get(watch.id, [])
                )

    summary.unmatched_keywords = sorted(
        {
            rows[0].keyword
            for key, rows in by_keyword.items()
            if key not in matched_keywords
        }
    )
    return summary
