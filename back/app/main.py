import logging
from contextlib import asynccontextmanager
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.database import SessionLocal, engine, Base
from app.core.settings import settings
from app.models.marketing_model import MarketingData as _MD, MarketingPeriodMeta as _MPM  # noqa: F401
from app.models.report_log_model import ReportLog as _RL  # noqa: F401,W0611
from app.models.system_setting_model import SystemSetting as _SS  # noqa: F401
from app.models.user_model import User as _User  # noqa: F401
from app.repositories.system_setting_repo import SystemSettingRepository
from app.routers import auth_router, marketing_router, keyword_compare_router, image_resize_router, image_filter_router, heading_router, system_setting_router
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


def _init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE marketing_period_meta ADD COLUMN IF NOT EXISTS excel_path TEXT"))
        conn.execute(text("ALTER TABLE marketing_period_meta DROP COLUMN IF EXISTS excel_content"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS signup FLOAT DEFAULT 0.0"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS purchase FLOAT DEFAULT 0.0"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS apply FLOAT DEFAULT 0.0"))

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


@asynccontextmanager
async def lifespan(_: FastAPI):
    _init_db()
    _template_bytes()  # 대용량 템플릿 선로드

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
        scheduler.start()
        logger.info("APScheduler started — monthly report cron active")
    else:
        logger.info("MAIL_ENABLED=false — 메일 발송 기능 비활성화")

    yield

    if settings.MAIL_ENABLED:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


app = FastAPI(title="Marketing AI Pipeline API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-AI-Reason", "X-AI-Provider"],
)

app.include_router(auth_router.router)
app.include_router(marketing_router.router)
app.include_router(keyword_compare_router.router)
app.include_router(image_resize_router.router)
app.include_router(image_filter_router.router)
app.include_router(heading_router.router)
app.include_router(system_setting_router.router)

if settings.MAIL_ENABLED:
    from app.routers import report_mail_router
    app.include_router(report_mail_router.router)


@app.get("/")
def read_root():
    return {"message": "FastAPI 서버가 정상적으로 실행 중입니다."}
