"""리포트 메일 발송 이력 조회 및 실패 건 재발송 (관리자 전용).

발송은 백그라운드로 이뤄져서, 실패해도 요청한 사람이 바로 알기 어렵다.
ReportLog에는 기록이 남지만 이를 볼 화면이 없었다.

재발송은 원래 실패 기록을 고쳐 쓰지 않고 새 시도로 처리한다 — 언제 무엇이
실패했는지가 이력에서 사라지면 안 되기 때문이다.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_db, require_admin
from app.core.settings import settings
from app.models.user_model import User
from app.repositories.report_log_repo import ReportLogRepository
from app.schemas.admin_report_log_schema import (
    ReportLogListResponse,
    ReportLogOut,
    ReportResendResponse,
)
from app.services.report_factory import build_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/report-logs", tags=["admin-report-logs"])


@router.get("", response_model=ReportLogListResponse)
def list_report_logs(
    status_filter: str | None = Query(None, alias="status", description="sent | error"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> ReportLogListResponse:
    repo = ReportLogRepository(db)
    return ReportLogListResponse(
        items=[ReportLogOut.model_validate(r) for r in repo.list_logs(
            status=status_filter, limit=limit, offset=offset
        )],
        total=repo.count(status=status_filter),
        counts=repo.count_by_status(),
    )


@router.post("/{log_id}/resend", response_model=ReportResendResponse)
def resend_report(
    log_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> ReportResendResponse:
    """실패한 발송 건을 같은 조건으로 다시 시도한다."""
    if not settings.MAIL_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="메일 발송 기능이 비활성화되어 있습니다 (MAIL_ENABLED=false).",
        )

    repo = ReportLogRepository(db)
    log = repo.get(log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="발송 기록을 찾을 수 없습니다.")

    recipients = [r.strip() for r in (log.recipients or "").split(",") if r.strip()]
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 기록에는 수신자가 남아 있지 않아 재발송할 수 없습니다.",
        )

    orchestrator = build_orchestrator(db)
    try:
        orchestrator.run(
            curr_year=log.curr_year,
            curr_month=log.curr_month,
            prev_year=log.prev_year,
            prev_month=log.prev_month,
            recipients=recipients,
            subject=log.subject,
        )
    except Exception as exc:
        # orchestrator가 실패 로그를 이미 남겼으므로 여기서는 사유만 전달한다.
        logger.exception("리포트 재발송 실패 (log_id=%s)", log_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"재발송 실패: {exc}"
        ) from exc

    # run()이 새로 남긴 로그가 가장 최근 기록이다.
    latest = repo.list_logs(limit=1)[0]
    return ReportResendResponse(
        status="sent",
        recipients=recipients,
        log=ReportLogOut.model_validate(latest),
    )
