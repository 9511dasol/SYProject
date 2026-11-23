"""API 자동 수집(M2) — 감시 키워드의 순위를 네이버에서 직접 받아 적재한다.

흐름은 업로드 경로와 같은 자리로 합류한다:
    키워드 ID 해석(필요할 때만) → 통계 조회 → RankObservation → ingest_observations

해석 결과를 감시 행에 저장하는 이유
──────────────────────────────────
광고 키워드 ID 는 계정 전체를 훑어야 얻는다(광고그룹 하나당 한 번씩 호출, 측정한
계정은 330개 ≈ 1분). 매일 그걸 다시 하면 수집의 대부분이 "이미 아는 것을 다시
찾는" 데 쓰인다. 한 번 찾으면 저장해 두고, 새 감시가 생겼거나 오래됐을 때만 다시 찾는다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.settings import settings
from app.models.keyword_watch_model import KeywordWatch
from app.repositories.keyword_watch_repo import KeywordWatchRepository
from app.services.rank.base import RankProviderError
from app.services.rank.naver_client import (
    ERR_KEYWORD_NOT_FOUND,
    ERR_NOT_CONFIGURED,
    error_message,
)
from app.services.rank.naver_provider import NaverRankProvider
from app.services.rank.report_parser import normalize_keyword
from app.services.rank_monitor_service import IngestSummary, ingest_observations

logger = logging.getLogger(__name__)

# 저장해 둔 키워드 ID 를 며칠까지 믿을 것인가(설정으로 조정 가능).
# 광고그룹이 개편되면 ID 가 바뀌므로 주기적으로 다시 확인한다.
def _id_cache_max_age() -> timedelta:
    return timedelta(days=settings.RANK_ID_CACHE_DAYS)


@dataclass
class CollectResult:
    stat_date: date
    collected: int = 0          # 순위를 받아 적재한 감시 수
    resolved: int = 0           # 이번에 키워드 ID 를 새로 찾은 감시 수
    not_found: list[str] = field(default_factory=list)  # 계정에서 찾지 못한 키워드
    skipped_reason: str | None = None
    ingest: IngestSummary | None = None


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite 는 시간대를 잃는다 — 비교 전에 UTC 로 맞춘다."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _needs_resolution(watch: KeywordWatch, now: datetime) -> bool:
    """키워드 ID 를 (다시) 찾아야 하는가.

    빈 목록([])과 미해석(None)을 구분하는 것이 핵심이다. 빈 목록은 "찾아봤지만
    계정에 없었다"는 **결론**이다. 이를 미해석으로 취급하면, 오타 하나나 광고를
    내린 키워드 하나 때문에 매일 계정 전체를 훑게 된다(광고그룹 330개 ≈ 1분).
    결론도 캐시 기간이 지나면 다시 확인한다 — 나중에 등록될 수 있기 때문이다.
    """
    if watch.nv_keyword_ids is None:
        return True
    synced = _aware(watch.nv_synced_at)
    return synced is None or now - synced > _id_cache_max_age()


def default_target_date() -> date:
    """전일 — 당일 통계는 아직 확정되지 않았다."""
    return date.today() - timedelta(days=1)


def collect_ranks(
    db: Session,
    *,
    target_date: date | None = None,
    provider: NaverRankProvider | None = None,
    force_resolve: bool = False,
) -> CollectResult:
    """감시 키워드의 순위를 받아 적재한다. commit 은 호출부가 한다."""
    target_date = target_date or default_target_date()
    provider = provider or NaverRankProvider()
    result = CollectResult(stat_date=target_date)

    if not provider.is_configured:
        result.skipped_reason = error_message(ERR_NOT_CONFIGURED)
        return result

    repo = KeywordWatchRepository(db)
    watches = [w for w in repo.list_all() if w.status == "active"]
    if not watches:
        result.skipped_reason = "감시 중인 키워드가 없습니다."
        return result

    now = datetime.now(timezone.utc)
    stale = [w for w in watches if force_resolve or _needs_resolution(w, now)]

    # ── 1단계: 필요한 감시만 키워드 ID 를 찾는다 (계정 훑기는 한 번뿐) ──────────
    if stale:
        try:
            index = provider.build_keyword_index()
        except RankProviderError as exc:
            _mark_error(stale, exc.code, now)
            result.skipped_reason = exc.message
            return result

        for watch in stale:
            ids = index.get(normalize_keyword(watch.keyword), [])
            watch.nv_keyword_ids = ids
            watch.nv_synced_at = now
            if ids:
                watch.last_error_code = None
                watch.last_error_at = None
                result.resolved += 1
            else:
                # 계정에 없는 키워드다. 오류로 남기되 수집 자체는 계속한다.
                watch.last_error_code = ERR_KEYWORD_NOT_FOUND
                watch.last_error_at = now
                result.not_found.append(watch.keyword)

    # ── 2단계: ID 가 있는 감시의 통계를 받는다 ────────────────────────────────
    keyword_to_ids = {
        w.keyword: list(w.nv_keyword_ids) for w in watches if w.nv_keyword_ids
    }
    if not keyword_to_ids:
        result.skipped_reason = "순위를 받을 키워드가 없습니다 (계정에서 찾지 못했습니다)."
        return result

    try:
        observations = provider.observations_for(keyword_to_ids, target_date)
    except RankProviderError as exc:
        _mark_error([w for w in watches if w.nv_keyword_ids], exc.code, now)
        result.skipped_reason = exc.message
        return result

    # ── 3단계: 업로드와 같은 적재 경로로 합류 ─────────────────────────────────
    summary = ingest_observations(db, observations, stat_date=target_date, source="api")
    result.ingest = summary
    result.collected = summary.matched_watches

    for watch in watches:
        if watch.nv_keyword_ids and watch.last_error_code != ERR_KEYWORD_NOT_FOUND:
            watch.last_error_code = None
            watch.last_error_at = None

    logger.info(
        "순위 자동 수집 — %s, 대상 %d개(ID 신규 해석 %d) → 적재 %d건",
        target_date, len(watches), result.resolved, summary.matched_watches,
    )
    return result


def _mark_error(watches: list[KeywordWatch], code: str, now: datetime) -> None:
    for watch in watches:
        watch.last_error_code = code
        watch.last_error_at = now
