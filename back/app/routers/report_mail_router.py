from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.feature_flags import require_feature_flag
from app.models.report_log_model import ReportLog
from app.services.analysis_service import AnalysisService
from app.services.comment_service import CommentService
from app.services.llm import build_llm
from app.services.mail import build_mail_sender
from app.services.report_builder_service import ReportBuilderService
from app.services.report_orchestrator import ReportOrchestrator

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/report-mail",
    tags=["report-mail"],
    dependencies=[Depends(require_feature_flag("is_report_email_enabled"))],
)


# ── 의존성 ────────────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _build_orchestrator(db: Session) -> ReportOrchestrator:
    return ReportOrchestrator(
        analysis_svc=AnalysisService(db),
        comment_svc=CommentService(llm=build_llm()),
        builder_svc=ReportBuilderService(),
        mail_sender=build_mail_sender(),
        db=db,
    )


# ── 스키마 ────────────────────────────────────────────────────────────────────

class SendReportRequest(BaseModel):
    curr_year: int
    curr_month: int
    prev_year: int
    prev_month: int
    recipients: list[EmailStr]
    subject: str = ""

    @field_validator("recipients")
    @classmethod
    def at_least_one(cls, v: list) -> list:
        if not v:
            raise ValueError("수신자를 1명 이상 입력하세요.")
        return v


class LogResponse(BaseModel):
    id: int
    curr_year: int
    curr_month: int
    prev_year: int
    prev_month: int
    recipients: str
    subject: str
    status: str
    error_msg: str | None
    created_at: str

    model_config = {"from_attributes": True}


# ── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.post("/send", summary="리포트 메일 발송 (백그라운드)")
def send_report(
    body: SendReportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """분석 → LLM 코멘트 → HTML 빌드 → 메일 발송을 백그라운드로 실행합니다."""

    def _task() -> None:
        task_db = SessionLocal()
        try:
            orchestrator = _build_orchestrator(task_db)
            orchestrator.run(
                curr_year=body.curr_year,
                curr_month=body.curr_month,
                prev_year=body.prev_year,
                prev_month=body.prev_month,
                recipients=list(body.recipients),
                subject=body.subject,
            )
        except Exception:
            logger.exception("Background report task failed")
        finally:
            task_db.close()

    background_tasks.add_task(_task)
    return {"status": "queued", "message": "리포트 메일 발송이 시작되었습니다."}


@router.get("/send/sync", summary="리포트 메일 발송 (동기 — 테스트용)")
def send_report_sync(
    curr_year: int,
    curr_month: int,
    prev_year: int,
    prev_month: int,
    recipients: str,
    subject: str = "",
    db: Session = Depends(get_db),
):
    """즉시 발송하고 결과를 반환합니다 (주로 테스트용)."""
    to = [r.strip() for r in recipients.split(",") if r.strip()]
    if not to:
        raise HTTPException(status_code=400, detail="수신자를 입력하세요.")
    orchestrator = _build_orchestrator(db)
    result = orchestrator.run(
        curr_year=curr_year,
        curr_month=curr_month,
        prev_year=prev_year,
        prev_month=prev_month,
        recipients=to,
        subject=subject,
    )
    return result


@router.get("/logs", response_model=list[LogResponse], summary="발송 이력 조회")
def get_logs(limit: int = 50, db: Session = Depends(get_db)):
    rows = (
        db.query(ReportLog)
        .order_by(ReportLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        LogResponse(
            id=r.id,
            curr_year=r.curr_year,
            curr_month=r.curr_month,
            prev_year=r.prev_year,
            prev_month=r.prev_month,
            recipients=r.recipients,
            subject=r.subject,
            status=r.status,
            error_msg=r.error_msg,
            created_at=str(r.created_at),
        )
        for r in rows
    ]
