from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy.orm import Session

from app.core.ai_budget import require_ai_budget
from app.core.database import SessionLocal
from app.core.feature_flags import require_feature_flag
from app.core.security import (
    get_current_user,
    get_db,
    require_admin,
    require_outbound_allowed,
)
from app.core.tenant import TenantContext, get_tenant_context
from app.models.user_model import User
from app.repositories.report_log_repo import ReportLogRepository
from app.services.report_factory import build_orchestrator

logger = logging.getLogger(__name__)

# 다른 라우터와 달리 인증 의존성이 빠져 있어서, 이 엔드포인트만 로그인 없이
# 호출할 수 있었다 — 아무나 리포트 메일 발송을 트리거할 수 있는 상태였다.
router = APIRouter(
    prefix="/api/report-mail",
    tags=["report-mail"],
    dependencies=[
        Depends(require_feature_flag("is_report_email_enabled")),
        Depends(get_current_user),
    ],
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


class PreviewReportRequest(BaseModel):
    curr_year: int
    curr_month: int
    prev_year: int
    prev_month: int
    subject: str = ""


class PreviewReportResponse(BaseModel):
    subject: str
    comment: str
    html: str


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

    model_config = ConfigDict(from_attributes=True)


# ── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.post(
    "/preview",
    response_model=PreviewReportResponse,
    summary="리포트 미리보기 (발송 없음)",
    dependencies=[Depends(require_ai_budget)],
)
def preview_report(
    body: PreviewReportRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
) -> PreviewReportResponse:
    """발송될 메일과 같은 제목·AI 코멘트·HTML 본문을 만들어 돌려준다.

    검토되지 않은 AI 코멘트가 외부 수신자에게 바로 나가지 않도록, 화면은 이
    결과를 보여준 뒤에 발송을 받는다. 여기서 생성된 코멘트는 캐시에 저장되어
    뒤이은 발송이 그대로 재사용한다 — 미리보기를 거쳐도 비용이 두 번 들지 않는다.
    """
    orchestrator = build_orchestrator(db, user=ctx.user, company_id=ctx.company_id)
    result = orchestrator.preview(
        curr_year=body.curr_year,
        curr_month=body.curr_month,
        prev_year=body.prev_year,
        prev_month=body.prev_month,
        subject=body.subject,
    )
    return PreviewReportResponse(**result)


@router.post(
    "/send",
    summary="리포트 메일 발송 (백그라운드)",
    dependencies=[Depends(require_outbound_allowed), Depends(require_ai_budget)],
)
def send_report(
    body: SendReportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    """분석 → LLM 코멘트 → HTML 빌드 → 메일 발송을 백그라운드로 실행합니다."""

    # BackgroundTask 는 응답을 보낸 뒤 실행된다 — 그 시점엔 요청 세션이 이미 닫혀
    # current_user 가 detached 상태이고, 사용량 기록(log_ai_usage)이 .id/.email 을
    # 읽는 순간 DetachedInstanceError 가 난다. log_ai_usage 는 기록 실패를 삼키므로
    # 백그라운드 발송의 토큰 사용량만 조용히 누락됐다. 세션과 무관한 원시 값을
    # 지금 떠 두고, 태스크 안에서는 임시 User 객체로 전달한다(레포는 id/email 만 읽는다).
    user_id = ctx.user.id
    user_email = ctx.user.email
    company_id = ctx.company_id

    def _task() -> None:
        task_db = SessionLocal()
        try:
            orchestrator = build_orchestrator(
                task_db, user=User(id=user_id, email=user_email), company_id=company_id
            )
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


@router.post(
    "/send/sync",
    summary="리포트 메일 발송 (동기 — 관리자 점검용)",
    # require_admin 이 이미 trial 을 걸러내지만, 발송 경로마다 "외부로 나간다"는
    # 사실을 명시해 둔다 — 나중에 권한이 완화돼도 체험 차단은 남는다.
    dependencies=[Depends(require_outbound_allowed), Depends(require_ai_budget)],
)
def send_report_sync(
    body: SendReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
    ctx: TenantContext = Depends(get_tenant_context),
):
    """즉시 발송하고 결과를 반환합니다 (발송 설정 점검용).

    예전에는 GET + 쿼리스트링이었다. 메일 발송은 부작용이 있는 동작이라 GET 으로
    두면 링크 프리페치나 캐시에 의해 의도치 않게 발송될 수 있고, 비동기 /send 에는
    걸려 있는 AI 예산 게이트도 이 경로에만 빠져 있어 집계를 우회할 수 있었다.
    관리자만 호출하도록 제한한다.
    """
    orchestrator = build_orchestrator(db, user=current_user, company_id=ctx.company_id)
    return orchestrator.run(
        curr_year=body.curr_year,
        curr_month=body.curr_month,
        prev_year=body.prev_year,
        prev_month=body.prev_month,
        recipients=list(body.recipients),
        subject=body.subject,
    )


@router.get("/logs", response_model=list[LogResponse], summary="발송 이력 조회")
def get_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    """발송 이력을 최신순으로 반환한다.

    쿼리를 라우터에서 직접 짜지 않고 ReportLogRepository 를 쓴다 — 같은 테이블을
    읽는 관리자 화면(admin_report_log_router)과 정렬 기준이 갈라지지 않게 한다
    (레포는 created_at 이 같을 때 id 로 한 번 더 정렬해 순서가 흔들리지 않는다).
    """
    rows = ReportLogRepository(db, ctx.company_id).list_logs(limit=limit, offset=offset)
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
