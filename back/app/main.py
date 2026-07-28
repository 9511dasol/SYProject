import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from alembic import command
from alembic.config import Config
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.database import SessionLocal
from app.core.rate_limit import limiter
from app.core.settings import settings
from app.models.ai_tool_usage_log_model import AIToolUsageLog as _ATUL  # noqa: F401
from app.models.ai_usage_budget_model import AIUsageBudget as _AUB  # noqa: F401
from app.models.background_task_model import BackgroundTask as _BT  # noqa: F401
from app.models.marketing_model import MarketingData as _MD, MarketingPeriodMeta as _MPM  # noqa: F401
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
    health_router,
    heading_router,
    image_filter_router,
    image_resize_router,
    keyword_compare_router,
    marketing_router,
    system_setting_router,
    user_admin_router,
)
from app.services import task_store
from app.services.excel_service import _template_bytes

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# 관리자 페이지 "기능 플래그" 기본값 — key: (기본값, 설명)
_DEFAULT_FEATURE_FLAGS: dict[str, tuple[str, str]] = {
    "is_dashboard_enabled":      ("true", "SA 광고 대시보드 (/)"),
    "is_report_email_enabled":   ("true", "코멘트 & 리포트 메일 (/report-email)"),
    "is_keyword_compare_enabled": ("true", "키워드 성과 비교 (/keyword-compare)"),
    "is_image_filter_enabled":   ("true", "이미지 정제 (/image-filter)"),
    "is_image_resize_enabled":   ("true", "이미지 리사이저 (/image-resize)"),
    "is_heading_suggest_enabled": ("true", "헤딩 문구 추천 (/heading-suggest)"),
}


_BACK_DIR = Path(__file__).resolve().parent.parent  # back/ (alembic.ini, migrations/ 위치)


def _run_migrations() -> None:
    """앱 시작 시 DB 스키마를 최신 상태로 맞춘다 (alembic upgrade head).

    스키마 관리는 전적으로 migrations/ 의 Alembic 리비전이 담당한다.
    (예전처럼 create_all/ALTER 를 여기서 직접 실행하지 않는다.)
    """
    cfg = Config(str(_BACK_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACK_DIR / "migrations"))
    command.upgrade(cfg, "head")
    logger.info("Alembic migrations applied (head)")


def _init_db() -> None:
    _run_migrations()

    db = SessionLocal()
    try:
        SystemSettingRepository(db).ensure_defaults(_DEFAULT_FEATURE_FLAGS)
    finally:
        db.close()


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
        from app.routers.report_mail_router import _build_orchestrator  # noqa: PLC0415
        orchestrator = _build_orchestrator(db)
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    _init_db()
    _template_bytes()  # 대용량 템플릿 선로드
    _purge_expired_tasks()  # 재시작 시 남아 있던 만료 행 먼저 정리

    # 작업 상태를 DB에 두면서 생긴 정리 책임 — 인스턴스가 살아 있는 동안 주기적으로 비운다.
    scheduler.add_job(
        _purge_expired_tasks,
        trigger="interval",
        hours=1,
        id="purge_expired_tasks",
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
    else:
        logger.info("MAIL_ENABLED=false — 메일 발송 기능 비활성화")

    scheduler.start()
    logger.info("APScheduler started")

    yield

    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(title="Marketing AI Pipeline API", version="1.0.0", lifespan=lifespan)

# slowapi: 데코레이터가 app.state.limiter를 찾고, 초과 시 429를 응답한다.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

if settings.MAIL_ENABLED:
    from app.routers import report_mail_router
    app.include_router(report_mail_router.router)


@app.get("/")
def read_root():
    return {"message": "FastAPI 서버가 정상적으로 실행 중입니다."}
