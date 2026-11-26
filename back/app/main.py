import logging
import time
from contextlib import asynccontextmanager
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.database import SessionLocal
from app.core.errors import GENERIC_SERVER_ERROR
from app.core.logging_config import configure_logging
from app.core.migrations import schema_state, upgrade_to_head
from app.core.rate_limit import limiter
from app.core.settings import settings
from app.models.ai_tool_usage_log_model import AIToolUsageLog as _ATUL  # noqa: F401
from app.models.ai_usage_budget_model import AIUsageBudget as _AUB  # noqa: F401
from app.models.audit_log_model import AuditLog as _AL  # noqa: F401
from app.models.background_task_model import BackgroundTask as _BT  # noqa: F401
from app.models.company_model import Company as _CO  # noqa: F401
from app.models.keyword_watch_model import (  # noqa: F401
    KeywordRankSnapshot as _KRS,
    KeywordWatch as _KW,
)
from app.models.marketing_model import MarketingData as _MD, MarketingPeriodMeta as _MPM  # noqa: F401
from app.models.rank_alert_log_model import RankAlertLog as _RAL  # noqa: F401
from app.models.report_log_model import ReportLog as _RL  # noqa: F401,W0611
from app.models.system_setting_model import SystemSetting as _SS  # noqa: F401
from app.models.undo_snapshot_model import UndoSnapshot as _US  # noqa: F401
from app.models.user_model import User as _User  # noqa: F401
from app.repositories.system_setting_repo import SystemSettingRepository
from app.routers import (
    admin_ai_usage_log_router,
    admin_period_router,
    admin_report_log_router,
    ai_status_router,
    auth_router,
    dev_router,
    health_router,
    heading_router,
    image_filter_router,
    image_resize_router,
    keyword_compare_router,
    marketing_router,
    rank_monitor_router,
    system_setting_router,
    user_admin_router,
)
from app.services import task_store, trial_service
from app.services.rank.alert_factory import run_rank_alerts
from app.services.rank.collector import collect_ranks
from app.services.rank.credentials import naver_scope_company_id
from app.services.report_factory import build_orchestrator

configure_logging(settings.LOG_LEVEL)  # 아래 기동 로그가 실제로 남으려면 먼저 호출돼야 한다

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# 관리자 페이지 "기능 플래그" 기본값 — key: (기본값, 설명)
_DEFAULT_FEATURE_FLAGS: dict[str, tuple[str, str]] = {
    "is_dashboard_enabled":      ("true", "SA 광고 대시보드 (/dashboard)"),
    "is_report_email_enabled":   ("true", "코멘트 & 리포트 메일 (/report-email)"),
    "is_keyword_compare_enabled": ("true", "키워드 성과 비교 (/keyword-compare)"),
    "is_image_filter_enabled":   ("true", "이미지 정제 (/image-filter)"),
    "is_image_resize_enabled":   ("true", "이미지 리사이저 (/image-resize)"),
    "is_heading_suggest_enabled": ("true", "헤딩 문구 추천 (/heading-suggest)"),
    "is_rank_monitor_enabled":   ("true", "키워드 순위 모니터링 (/rank-monitor)"),
}


def _apply_migrations() -> None:
    """개발 편의용 자동 적용 (RUN_MIGRATIONS_ON_STARTUP=true)."""
    logger.info("기동 1/2: DB 마이그레이션 적용 (alembic upgrade head)")
    started = time.monotonic()
    try:
        upgrade_to_head()
    except Exception:
        logger.exception(
            "기동 실패: DB 마이그레이션 (%.1fs 경과). DATABASE_URL 접속 가능 여부를 확인하세요.",
            time.monotonic() - started,
        )
        raise
    logger.info("기동 1/2 완료: 마이그레이션 적용됨 (%.1fs)", time.monotonic() - started)


def _verify_schema() -> None:
    """운영 기본 동작 — 적용하지 않고 상태만 확인한다.

    스키마가 어긋나 있어도 기동을 막지 않는다. 여기서 예외를 던지면 포트가 열리지
    않아 Cloud Run에는 원인 불명의 전면 장애로 보이기 때문이다. 대신 무엇이
    어긋났는지 ERROR 로그로 분명히 남긴다 — 적용 책임은 배포 단계에 있다.
    """
    logger.info("기동 1/2: DB 스키마 상태 확인 (자동 적용 꺼짐)")
    try:
        state, detail = schema_state()
    except Exception:
        logger.exception("기동 1/2: 스키마 상태를 확인하지 못했습니다 (DB 접속 실패).")
        return

    if state == "ok":
        logger.info("기동 1/2 완료: %s", detail)
    else:
        logger.error("스키마 불일치 [%s] — %s", state, detail)


def _init_db() -> None:
    """기동 전에 반드시 끝나야 하는 준비 작업.

    이 함수가 끝나야 서버가 포트를 연다. 그래서 여기서 막히면 Cloud Run에는
    "컨테이너가 PORT에서 리슨하지 못했다"로만 보이고 원인이 드러나지 않는다.
    단계마다 로그를 남겨, 실패했을 때 어디까지 갔는지 로그만 보고 알 수 있게 한다.
    """
    if settings.RUN_MIGRATIONS_ON_STARTUP:
        _apply_migrations()
    else:
        _verify_schema()

    logger.info("기동 2/2: 기능 플래그 기본값 확인")
    db = SessionLocal()
    try:
        SystemSettingRepository(db).ensure_defaults(_DEFAULT_FEATURE_FLAGS)
    except Exception:
        logger.exception("기동 실패: 기능 플래그 기본값 저장")
        raise
    finally:
        db.close()
    logger.info("기동 2/2 완료 — 이제 포트를 엽니다")


def _auto_send_report() -> None:
    """APScheduler가 호출하는 자동 월간 리포트 발송 작업."""
    recipients_raw = settings.REPORT_AUTO_RECIPIENTS
    if not recipients_raw.strip():
        logger.info("REPORT_AUTO_RECIPIENTS 미설정 — 자동 발송 건너뜀")
        return

    recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]
    today = date.today()
    curr_month = today.month - 1 or 12
    curr_year = today.year if today.month > 1 else today.year - 1
    prev_month = curr_month - 1 or 12
    prev_year = curr_year if curr_month > 1 else curr_year - 1

    db = SessionLocal()
    try:
        orchestrator = build_orchestrator(db)
        orchestrator.run(
            curr_year=curr_year,
            curr_month=curr_month,
            prev_year=prev_year,
            prev_month=prev_month,
            recipients=recipients,
        )
        logger.info("Auto report sent for %d/%d", curr_year, curr_month)
    except Exception:
        logger.exception("Auto report failed")
    finally:
        db.close()


def _purge_expired_tasks() -> None:
    """만료된 background_tasks / undo_snapshots 행을 정리한다."""
    tasks, undos = task_store.purge_expired()
    if tasks or undos:
        logger.info("만료 정리 — 작업 %d건, 되돌리기 스냅샷 %d건 삭제", tasks, undos)


def _purge_expired_trials() -> None:
    """만료된 체험(trial) 기업을 기업째 물리 삭제한다.

    로그인 차단은 ensure_company_access 가 만료 즉시 하고 있으므로, 이 잡은
    데이터를 실제로 비우는 2차 정리다 — 하루 늦어도 보안 문제는 없다.
    """
    db = SessionLocal()
    try:
        deleted = trial_service.purge_expired_trials(db)
        if deleted:
            logger.info("만료 체험 정리 — 기업 %d곳 삭제", deleted)
    except Exception:
        db.rollback()
        logger.exception("만료 체험 정리 실패")
    finally:
        db.close()


def _collect_ranks() -> None:
    """APScheduler 가 호출하는 일일 순위 자동 수집 (M2).

    전일 확정치를 받아 적재하고, 이어서 바로 알림을 평가한다 — 받아온 그 순간이
    하락이 확정되는 시점이라 다음 크론까지 기다릴 이유가 없다.
    """
    # 키가 전역 1벌이라 "전 기업"으로 돌리면 남의 기업 키워드를 소유 기업 계정으로
    # 조회하게 된다. 범위를 소유 기업으로 못박는다 — 기업별 자격증명이 생기면
    # 이 한 줄이 "자격증명을 가진 기업 목록 순회"로 바뀐다.
    scope = naver_scope_company_id()
    if scope is None:
        logger.info("일일 순위 수집 건너뜀 — 네이버 검색광고 API 미설정")
        return

    db = SessionLocal()
    try:
        result = collect_ranks(db, company_id=scope)
        db.commit()
        if result.skipped_reason:
            logger.info("일일 순위 수집 건너뜀 — %s", result.skipped_reason)
            return
        logger.info(
            "일일 순위 수집 완료 — %s, 적재 %d건 (ID 해석 %d, 미발견 %d)",
            result.stat_date, result.collected, result.resolved, len(result.not_found),
        )
        alerts = run_rank_alerts(db, scope)
        db.commit()
        if alerts.drops or alerts.recoveries:
            logger.info(
                "수집 직후 알림 — 하락 %d · 회복 %d (발송 %s)",
                alerts.drops, alerts.recoveries, alerts.sent,
            )
    except Exception:
        db.rollback()
        logger.exception("일일 순위 수집 실패")
    finally:
        db.close()


def _run_rank_alerts() -> None:
    """APScheduler 가 호출하는 일일 순위 알림 평가.

    업로드 직후에도 평가하지만, 그 경로만 두면 "하루 종일 아무도 올리지 않아
    하락을 아무도 모르는" 날이 생긴다. API 수집(M2)이 붙으면 이 경로가 주 경로가 된다.
    """
    # 수집 크론과 같은 이유로 범위를 고정한다 — 전역 수신자에게 남의 기업
    # 키워드가 담긴 메일이 나가지 않게.
    scope = naver_scope_company_id()
    if scope is None:
        return

    db = SessionLocal()
    try:
        result = run_rank_alerts(db, scope)
        db.commit()
        if result.drops or result.recoveries:
            logger.info(
                "일일 순위 알림 — 하락 %d · 회복 %d (발송 %s, 사유 %s)",
                result.drops, result.recoveries, result.sent, result.skipped_reason,
            )
    except Exception:
        db.rollback()
        logger.exception("일일 순위 알림 실패")
    finally:
        db.close()


def _align_worker_threads_with_db_pool() -> None:
    """워커 스레드 수를 DB 커넥션 풀 크기에 맞춘다.

    블로킹 엔드포인트를 스레드풀로 옮기면서 동시에 DB 를 때리는 요청 수가 워커 스레드
    수만큼 늘었다. anyio 기본값은 40 인데 커넥션 풀은 그보다 작아, 스레드는 남는데
    커넥션이 없어 pool_timeout(30초)을 기다리다 500 이 나는 조합이 된다.

    스레드를 풀 크기까지만 허용하면 초과분은 커넥션 대기 대신 스레드 대기로 줄을 선다 —
    같은 양의 일을 하지만 실패 대신 지연으로 나타난다.
    """
    import anyio.to_thread  # noqa: PLC0415 — 이벤트 루프 안에서만 불러야 한다

    allowed = settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW
    limiter = anyio.to_thread.current_default_thread_limiter()
    if limiter.total_tokens > allowed:
        limiter.total_tokens = allowed
        logger.info("worker threads capped at %d (DB pool size)", allowed)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _init_db()
    _align_worker_threads_with_db_pool()
    # 리포트 템플릿은 여기서 선로드하지 않는다.
    # 선로드하면 export를 한 번도 쓰지 않는 인스턴스까지 그 메모리를 상시 점유한다.
    # excel_service._template_bytes()가 첫 호출 때 읽고 mtime 기준으로 캐시하므로,
    # 첫 export만 파일 읽기만큼 느려지고 이후는 동일하다.
    _purge_expired_tasks()  # 재시작 시 남아 있던 만료 행 먼저 정리

    # 작업 상태를 DB에 두면서 생긴 정리 책임 — 인스턴스가 살아 있는 동안 주기적으로 비운다.
    scheduler.add_job(
        _purge_expired_tasks,
        trigger="interval",
        hours=1,
        id="purge_expired_tasks",
        replace_existing=True,
    )

    # 만료된 체험 기업 물리 삭제 — 즉시 차단은 인증 경로가 하므로 하루 1회면 충분하다.
    scheduler.add_job(
        _purge_expired_trials,
        trigger="cron",
        hour=int(settings.TRIAL_PURGE_CRON_HOUR),
        id="trial_purge",
        replace_existing=True,
    )

    if settings.MAIL_ENABLED:
        # APScheduler: 매월 1일 오전 9시 자동 리포트 (환경변수로 재설정 가능)
        scheduler.add_job(
            _auto_send_report,
            trigger="cron",
            hour=int(settings.REPORT_CRON_HOUR),
            day=settings.REPORT_CRON_DAY,
            id="monthly_report",
            replace_existing=True,
        )
        logger.info("monthly report cron active")

        # 순위 알림은 매일 평가한다. 수신자가 비어 있으면 엔진이 보내지 않고
        # 상태도 바꾸지 않으므로, 설정을 나중에 채워도 그 하락은 그대로 알려진다.
        scheduler.add_job(
            _run_rank_alerts,
            trigger="cron",
            hour=int(settings.RANK_ALERT_CRON_HOUR),
            id="rank_alerts",
            replace_existing=True,
        )
        logger.info("daily rank alert cron active")
    else:
        logger.info("MAIL_ENABLED=false — 메일 발송 기능 비활성화")

    # 순위 자동 수집은 메일 설정과 무관하다 — 알림을 못 보내도 순위는 쌓여야 한다.
    if settings.is_naver_searchad_configured:
        scheduler.add_job(
            _collect_ranks,
            trigger="cron",
            hour=int(settings.RANK_COLLECT_CRON_HOUR),
            id="rank_collect",
            replace_existing=True,
        )
        logger.info("daily rank collect cron active")
    else:
        logger.info("네이버 검색광고 API 미설정 — 순위 자동 수집 꺼짐 (업로드로만 적재)")

    scheduler.start()
    logger.info("APScheduler started")

    yield

    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(title="Marketing AI Pipeline API", version="1.0.0", lifespan=lifespan)

# slowapi: 데코레이터가 app.state.limiter를 찾고, 초과 시 429를 응답한다.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """처리되지 않은 예외를 로그로 남기고 일반화된 500 을 돌려준다.

    이게 없으면 각 라우터가 제각각 `detail=f"...: {exc}"` 로 원본 메시지를 노출하거나
    (정보 노출), 아무도 잡지 않아 어떤 요청이 왜 깨졌는지 로그에 남지 않았다.
    """
    logger.exception("처리되지 않은 예외: %s %s", request.method, request.url.path)
    return JSONResponse({"detail": GENERIC_SERVER_ERROR}, status_code=500)


_MAX_REQUEST_BYTES = settings.MAX_REQUEST_MB * 1_024 * 1_024


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """본문이 지나치게 큰 요청을 라우터에 닿기 전에 거른다.

    엔드포인트별 검증은 각자의 상한을 따로 두지만, 그 코드가 실행되려면
    Starlette이 본문을 먼저 버퍼링해야 한다. 여기서 Content-Length만 보고
    미리 끊으면 그 비용 자체를 피할 수 있다.
    (Content-Length는 없거나 거짓일 수 있으므로 엔드포인트 검증을 대체하지 않는다.)
    """
    raw = request.headers.get("content-length")
    if raw and raw.isdigit() and int(raw) > _MAX_REQUEST_BYTES:
        return JSONResponse(
            {"detail": f"요청 본문이 너무 큽니다 (최대 {settings.MAX_REQUEST_MB}MB)."},
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-AI-Provider", "X-AI-Upscale-Used"],
)

app.include_router(health_router.router)
app.include_router(auth_router.router)
app.include_router(marketing_router.router)
app.include_router(keyword_compare_router.router)
app.include_router(rank_monitor_router.router)
app.include_router(image_resize_router.router)
app.include_router(image_filter_router.router)
app.include_router(heading_router.router)
app.include_router(system_setting_router.router)
app.include_router(user_admin_router.router)
app.include_router(ai_status_router.router)
app.include_router(admin_ai_usage_log_router.router)
# 발송 이력 조회는 MAIL_ENABLED와 무관하게 열어 둔다 — 메일을 꺼도 과거 기록은 봐야 한다.
# (재발송만 라우터 안에서 MAIL_ENABLED를 확인한다)
app.include_router(admin_report_log_router.router)
app.include_router(admin_period_router.router)
app.include_router(dev_router.router)

if settings.MAIL_ENABLED:
    from app.routers import report_mail_router
    app.include_router(report_mail_router.router)


@app.get("/")
def read_root():
    return {"message": "FastAPI 서버가 정상적으로 실행 중입니다."}
