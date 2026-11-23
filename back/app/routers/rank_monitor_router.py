"""키워드 순위 모니터링 (M1) — 감시 등록·목록·이력·보고서 업로드 적재.

매일 아침 키워드 순위를 손으로 확인하던 작업을 대신한다. M1 은 키워드 보고서
업로드가 순위의 유일한 출처이고, M2 에서 네이버 검색광고 API 수집이 더해진다.
알림 발송은 M3 — 여기서는 이탈 판정(breach_streak)까지만 책임진다.
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.feature_flags import require_feature_flag
from app.core.security import get_current_user, get_db
from app.core.uploads import check_content_length, read_data_upload
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.user_model import User
from app.repositories.keyword_watch_repo import KeywordWatchRepository
from app.schemas.rank_monitor_schema import (
    AlertLogListResponse,
    AlertLogOut,
    AlertSummary,
    BidEstimateResponse,
    BidRowOut,
    CollectResponse,
    CollectStatus,
    KeywordInsightResponse,
    SnapshotOut,
    SnapshotUploadResponse,
    WatchBulkCreateRequest,
    WatchBulkCreateResponse,
    WatchCreateResult,
    WatchDeleteResponse,
    WatchHistoryResponse,
    WatchListResponse,
    WatchOut,
    WatchUpdate,
)
from app.core.settings import settings
from app.services.rank.alert_engine import AlertRunResult
from app.services.rank.alert_factory import run_rank_alerts
from app.services.rank.base import RankProviderError
from app.services.rank.bid_estimate import MAX_POSITION, BidEstimateService
from app.services.rank.collector import collect_ranks
from app.services.rank.keyword_insight import KeywordInsightService
from app.services.rank.naver_client import ERR_NOT_CONFIGURED, error_message
from app.services.rank.report_parser import (
    RankReportParseError,
    normalize_keyword,
    parse_rank_report,
)
from app.services.rank_monitor_service import ingest_observations, recompute_streak

logger = logging.getLogger(__name__)

# 이 중 하나라도 바뀌면 breach_streak 을 다시 계산해야 한다 — 전부 이탈 판정에 쓰인다.
# ("status" 는 paused→active 로 돌아올 때 얼어 있던 값을 되살리기 위해 포함한다)
_JUDGEMENT_FIELDS = frozenset(
    {"target_rank", "tolerance", "alert_on_no_impression", "breaches_required", "status"}
)

router = APIRouter(
    prefix="/api/rank-monitor",
    tags=["rank-monitor"],
    dependencies=[Depends(require_feature_flag("is_rank_monitor_enabled"))],
)


def _to_watch_out(
    watch: KeywordWatch, latest: KeywordRankSnapshot | None
) -> WatchOut:
    return WatchOut(
        id=watch.id,
        keyword=watch.keyword,
        device=watch.device,
        target_rank=watch.target_rank,
        tolerance=watch.tolerance,
        breaches_required=watch.breaches_required,
        cooldown_hours=watch.cooldown_hours,
        alert_on_no_impression=watch.alert_on_no_impression,
        color_tag=watch.color_tag,
        status=watch.status,
        breach_streak=watch.breach_streak,
        is_breached=watch.breach_streak >= watch.breaches_required,
        alerted=watch.alerted,
        last_alerted_at=watch.last_alerted_at,
        last_checked_at=watch.last_checked_at,
        nv_linked=bool(watch.nv_keyword_ids),
        nv_synced_at=watch.nv_synced_at,
        last_error_code=watch.last_error_code,
        last_error_message=(
            error_message(watch.last_error_code) if watch.last_error_code else None
        ),
        latest=SnapshotOut.model_validate(latest) if latest else None,
    )


def _to_alert_summary(result: AlertRunResult) -> AlertSummary:
    return AlertSummary(
        drops=result.drops,
        recoveries=result.recoveries,
        sent=result.sent,
        skipped_reason=result.skipped_reason,
    )


def _evaluate_alerts(db: Session) -> AlertSummary:
    """적재 뒤 알림을 평가한다. 실패해도 적재 결과를 덮지 않는다.

    데이터는 이미 저장됐다 — 알림이 안 나갔다고 업로드를 실패로 돌려주면
    사용자는 같은 파일을 다시 올리게 된다.
    """
    try:
        result = run_rank_alerts(db)
        db.commit()
        return _to_alert_summary(result)
    except Exception as exc:
        db.rollback()
        logger.exception("순위 알림 평가 실패")
        return AlertSummary(skipped_reason=f"알림 평가 실패: {exc}")


@router.post("/watches", response_model=WatchBulkCreateResponse)
def create_watches(
    payload: WatchBulkCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WatchBulkCreateResponse:
    """단건이든 대량이든 같은 경로 — 행별 성공/건너뜀/실패 사유를 돌려준다.

    일부가 중복이어도 전체를 거절하지 않는다. 엑셀로 수백 건을 올리는 사용자는
    "몇 번째가 왜 안 됐는지"가 필요하지, 전부 되돌리고 다시 올리는 게 아니다.
    """
    repo = KeywordWatchRepository(db)
    existing = repo.existing_pairs()
    results: list[WatchCreateResult] = []
    pending: list[tuple[WatchCreateResult, KeywordWatch]] = []  # commit 후 id 를 채운다

    for item in payload.items:
        # 띄어쓰기·대소문자만 다른 키워드는 적재 때 같은 것으로 매칭되므로 같은 것으로 센다.
        pair = (normalize_keyword(item.keyword), item.device)
        if pair in existing:
            results.append(
                WatchCreateResult(
                    keyword=item.keyword,
                    device=item.device,
                    status="skipped",
                    reason="이미 등록된 키워드입니다.",
                )
            )
            continue
        watch = repo.add(
            KeywordWatch(
                keyword=item.keyword,
                device=item.device,
                target_rank=item.target_rank,
                tolerance=item.tolerance,
                breaches_required=item.breaches_required,
                cooldown_hours=item.cooldown_hours,
                alert_on_no_impression=item.alert_on_no_impression,
                color_tag=item.color_tag,
                created_by=user.id,
            )
        )
        existing.add(pair)  # 같은 요청 안의 중복도 걸러야 한다
        result = WatchCreateResult(
            keyword=item.keyword, device=item.device, status="created"
        )
        results.append(result)
        pending.append((result, watch))

    try:
        # id 는 commit 전에 읽는다. commit 뒤에 읽으면 expire_on_commit 때문에
        # 행마다 새로 SELECT 가 나가 500건 등록이 500번 왕복이 된다.
        db.flush()
        for result, watch in pending:
            result.id = watch.id
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("감시 키워드 등록 실패 (%d건 요청)", len(payload.items))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc

    created = sum(1 for r in results if r.status == "created")
    skipped = sum(1 for r in results if r.status == "skipped")
    errors = sum(1 for r in results if r.status == "error")
    logger.info(
        "%s 가 감시 키워드 등록 — 생성 %d·건너뜀 %d·실패 %d", user.email, created, skipped, errors
    )
    return WatchBulkCreateResponse(
        results=results, created=created, skipped=skipped, errors=errors
    )


@router.get("/watches", response_model=WatchListResponse)
def list_watches(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> WatchListResponse:
    repo = KeywordWatchRepository(db)
    watches = repo.list_all()
    latest = repo.latest_snapshots([w.id for w in watches])
    return WatchListResponse(
        items=[_to_watch_out(w, latest.get(w.id)) for w in watches],
        total=len(watches),
    )


@router.patch("/watches/{watch_id}", response_model=WatchOut)
def update_watch(
    watch_id: int,
    payload: WatchUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> WatchOut:
    repo = KeywordWatchRepository(db)
    watch = repo.get(watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="감시 키워드를 찾을 수 없습니다.")

    changed = payload.model_dump(exclude_unset=True)
    for field_name, value in changed.items():
        setattr(watch, field_name, value)

    # 판정 기준이 바뀌었으면 연속 이탈을 다시 센다. 그냥 두면 "목표를 고쳤는데
    # 상태가 그대로"이고, 바로 이어지는 '지금 알림 평가'도 옛 기준으로 돈다.
    if _JUDGEMENT_FIELDS & changed.keys():
        recompute_streak(db, watch)

    db.commit()
    return _to_watch_out(watch, repo.latest_snapshots([watch.id]).get(watch.id))


@router.delete("/watches/{watch_id}", response_model=WatchDeleteResponse)
def delete_watch(
    watch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WatchDeleteResponse:
    """감시와 그 이력을 함께 삭제한다 (되돌릴 수 없음)."""
    repo = KeywordWatchRepository(db)
    watch = repo.get(watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="감시 키워드를 찾을 수 없습니다.")

    keyword = watch.keyword
    repo.delete(watch)
    db.commit()
    logger.info("%s 가 감시 키워드 삭제 — %s", user.email, keyword)
    return WatchDeleteResponse(id=watch_id, message=f"'{keyword}' 감시를 삭제했습니다.")


@router.get("/watches/{watch_id}/history", response_model=WatchHistoryResponse)
def watch_history(
    watch_id: int,
    limit: int = 90,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> WatchHistoryResponse:
    repo = KeywordWatchRepository(db)
    watch = repo.get(watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="감시 키워드를 찾을 수 없습니다.")

    items = repo.history(watch_id, limit=max(1, min(limit, 365)))
    latest = items[-1] if items else None
    return WatchHistoryResponse(
        watch=_to_watch_out(watch, latest),
        items=[SnapshotOut.model_validate(s) for s in items],
    )


@router.post("/snapshots/upload", response_model=SnapshotUploadResponse)
async def upload_snapshot_report(
    request: Request,
    file: UploadFile,
    stat_date: date = Form(..., description="보고서가 집계된 날짜 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SnapshotUploadResponse:
    """키워드 보고서(CSV/Excel)를 해당 날짜의 순위 스냅샷으로 적재한다.

    같은 날짜를 다시 올리면 새 행이 아니라 갱신이다 — 몇 번을 올려도 결과가 같다.
    """
    check_content_length(request)
    content = await read_data_upload(file)
    filename = file.filename or ""

    def _ingest() -> SnapshotUploadResponse:
        # pandas 파싱·DB 적재 모두 블로킹이라 스레드풀에서 돈다 (B1 원칙).
        try:
            observations = parse_rank_report(content, filename, stat_date)
        except RankReportParseError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc

        try:
            summary = ingest_observations(db, observations, stat_date=stat_date)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.exception("순위 스냅샷 적재 실패: %s (%s)", filename, stat_date)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="적재하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            ) from exc

        # 적재가 끝난 뒤 바로 평가한다 — 새 데이터가 들어온 그 순간이 하락이
        # 확정되는 시점이고, 다음 날 크론까지 기다릴 이유가 없다.
        alerts = _evaluate_alerts(db)

        return SnapshotUploadResponse(
            stat_date=summary.stat_date,
            matched_watches=summary.matched_watches,
            inserted=summary.inserted,
            updated=summary.updated,
            unmatched_keywords=summary.unmatched_keywords[:100],
            watches_no_data=summary.watches_no_data[:100],
            alerts=alerts,
        )

    response = await run_in_threadpool(_ingest)
    logger.info(
        "%s 가 순위 보고서 적재 — %s, 매칭 %d·신규 %d·갱신 %d, 알림 하락 %d·회복 %d",
        user.email, stat_date, response.matched_watches, response.inserted, response.updated,
        response.alerts.drops, response.alerts.recoveries,
    )
    return response


@router.get("/alerts", response_model=AlertLogListResponse)
def list_alerts(
    watch_id: int | None = Query(None, description="특정 감시의 이력만"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> AlertLogListResponse:
    repo = KeywordWatchRepository(db)
    return AlertLogListResponse(
        items=[
            AlertLogOut.model_validate(a)
            for a in repo.list_alerts(watch_id=watch_id, limit=limit, offset=offset)
        ],
        total=repo.count_alerts(watch_id=watch_id),
    )


@router.get("/watches/{watch_id}/bid-estimate", response_model=BidEstimateResponse)
async def watch_bid_estimate(
    watch_id: int,
    max_position: int = Query(5, ge=1, le=MAX_POSITION),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> BidEstimateResponse:
    """이 키워드를 N위로 노출하려면 얼마가 드는지 — 목표 순위를 정할 근거.

    외부 API 를 디바이스 수만큼 호출하므로 스레드풀에서 돈다.
    """
    repo = KeywordWatchRepository(db)
    watch = repo.get(watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="감시 키워드를 찾을 수 없습니다.")

    service = BidEstimateService()
    base = BidEstimateResponse(
        keyword=watch.keyword,
        device=watch.device,
        target_rank=watch.target_rank,
        rows=[],
    )
    if not service.is_configured:
        base.skipped_reason = error_message(ERR_NOT_CONFIGURED)
        return base

    def _estimate() -> BidEstimateResponse:
        try:
            result = service.estimate(watch.keyword, watch.device, max_position)
        except RankProviderError as exc:
            # 입찰가를 못 받은 것으로 화면 전체를 깨뜨리지 않는다 — 순위 이력은 그대로 보여야 한다.
            logger.warning("예상 입찰가 조회 실패 (%s): %s", watch.keyword, exc.code)
            base.skipped_reason = exc.message
            return base
        base.rows = [
            BidRowOut(position=r.position, pc=r.pc, mobile=r.mobile) for r in result.rows
        ]
        return base

    return await run_in_threadpool(_estimate)


@router.get("/watches/{watch_id}/insight", response_model=KeywordInsightResponse)
async def watch_insight(
    watch_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> KeywordInsightResponse:
    """이 키워드가 얼마나 치열한가 — 검색량·경쟁정도·평균 노출 광고 수."""
    repo = KeywordWatchRepository(db)
    watch = repo.get(watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="감시 키워드를 찾을 수 없습니다.")

    service = KeywordInsightService()
    if not service.is_configured:
        return KeywordInsightResponse(
            keyword=watch.keyword, skipped_reason=error_message(ERR_NOT_CONFIGURED)
        )

    def _fetch() -> KeywordInsightResponse:
        try:
            insight = service.fetch(watch.keyword)
        except RankProviderError as exc:
            logger.warning("경쟁 지표 조회 실패 (%s): %s", watch.keyword, exc.code)
            return KeywordInsightResponse(keyword=watch.keyword, skipped_reason=exc.message)
        if insight is None:
            return KeywordInsightResponse(
                keyword=watch.keyword,
                skipped_reason="매체 키워드 도구에서 이 키워드를 찾지 못했습니다.",
            )
        return KeywordInsightResponse(
            keyword=insight.keyword,
            monthly_pc=insight.monthly_pc,
            monthly_mobile=insight.monthly_mobile,
            pc_low_volume=insight.pc_low_volume,
            mobile_low_volume=insight.mobile_low_volume,
            competition=insight.competition,
            ad_depth=insight.ad_depth,
            ctr_pc=insight.ctr_pc,
            ctr_mobile=insight.ctr_mobile,
        )

    return await run_in_threadpool(_fetch)


@router.get("/collect/status", response_model=CollectStatus)
def collect_status(_user: User = Depends(get_current_user)) -> CollectStatus:
    """자동 수집을 쓸 수 있는 상태인지 — 화면이 안내 문구를 고르는 데 쓴다."""
    configured = settings.is_naver_searchad_configured
    return CollectStatus(
        configured=configured,
        message=(
            "네이버 광고 API가 연결되어 자동으로 순위를 받아옵니다."
            if configured
            else error_message(ERR_NOT_CONFIGURED)
        ),
    )


@router.post("/collect/run", response_model=CollectResponse)
async def run_collect_now(
    stat_date: date | None = Query(None, description="수집할 날짜 (기본: 어제)"),
    force_resolve: bool = Query(False, description="키워드 ID를 다시 찾는다"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CollectResponse:
    """지금 네이버 API로 순위를 받아 적재하고, 이어서 알림까지 평가한다.

    키워드 ID를 새로 찾아야 하면 광고 계정 전체를 훑느라 1분 안팎 걸릴 수 있다 —
    그래서 스레드풀에서 돌리고, 프런트는 이 요청에 상한을 걸지 않는다.
    """

    def _run() -> CollectResponse:
        try:
            result = collect_ranks(
                db, target_date=stat_date, force_resolve=force_resolve
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.exception("순위 자동 수집 실패")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"순위를 받아오지 못했습니다: {exc}",
            ) from exc

        # 받아온 직후가 하락이 확정되는 시점이다 — 바로 이어서 평가한다.
        alerts = (
            _evaluate_alerts(db)
            if result.ingest is not None
            else AlertSummary(skipped_reason=result.skipped_reason)
        )
        return CollectResponse(
            stat_date=result.stat_date,
            collected=result.collected,
            resolved=result.resolved,
            not_found=result.not_found[:100],
            skipped_reason=result.skipped_reason,
            alerts=alerts,
        )

    response = await run_in_threadpool(_run)
    logger.info(
        "%s 가 순위 자동 수집 실행 — %s, 적재 %d건 (ID 해석 %d)",
        user.email, response.stat_date, response.collected, response.resolved,
    )
    return response


@router.post("/alerts/run", response_model=AlertSummary)
async def run_alerts_now(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AlertSummary:
    """지금 상태로 알림을 평가해 보낸다 — 설정을 고친 뒤 바로 확인할 때 쓴다."""
    summary = await run_in_threadpool(_evaluate_alerts, db)
    logger.info(
        "%s 가 순위 알림 수동 평가 — 하락 %d·회복 %d (발송 %s)",
        user.email, summary.drops, summary.recoveries, summary.sent,
    )
    return summary
