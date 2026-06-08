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
from app.routers import marketing_router, keyword_compare_router, report_mail_router
from app.services.excel_service import _template_bytes

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def _init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE marketing_period_meta ADD COLUMN IF NOT EXISTS excel_content BYTEA"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS signup FLOAT DEFAULT 0.0"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS purchase FLOAT DEFAULT 0.0"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS apply FLOAT DEFAULT 0.0"))


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
        from app.routers.report_mail_router import _build_orchestrator
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

    yield

    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(title="Marketing AI Pipeline API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(marketing_router.router)
app.include_router(keyword_compare_router.router)
app.include_router(report_mail_router.router)


@app.get("/")
def read_root():
    return {"message": "FastAPI 서버가 정상적으로 실행 중입니다."}
