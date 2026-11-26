from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.ai_budget import current_month_start as _current_month_start
from app.core.security import get_db
from app.core.tenant import TenantContext, get_admin_tenant_context, log_audit
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.repositories.ai_usage_budget_repo import AIUsageBudgetRepository
from app.schemas.ai_tool_usage_log_schema import (
    AIToolUsageLogListResponse,
    AIUsageBudgetUpdate,
    AIUsageSummaryResponse,
)

router = APIRouter(prefix="/api/admin/ai-usage-logs", tags=["admin-ai-usage-logs"])


@router.get("", response_model=AIToolUsageLogListResponse)
def list_ai_usage_logs(
    tool: str | None = Query(None, description="image_filter | image_resize | heading_suggest"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
) -> AIToolUsageLogListResponse:
    repo = AIToolUsageLogRepository(db)
    items = repo.list_logs(company_id=ctx.company_id, tool=tool, limit=limit, offset=offset)
    total = repo.count(company_id=ctx.company_id, tool=tool)
    return AIToolUsageLogListResponse(items=items, total=total)


def _summary(db: Session, company_id: int) -> AIUsageSummaryResponse:
    month_start = _current_month_start()
    log_repo = AIToolUsageLogRepository(db)
    return AIUsageSummaryResponse(
        month=month_start.strftime("%Y-%m"),
        total_tokens=log_repo.sum_tokens_since(month_start, company_id=company_id),
        by_tool=log_repo.sum_tokens_by_tool_since(month_start, company_id=company_id),
        monthly_token_budget=AIUsageBudgetRepository(db).get(company_id),
    )


@router.get("/summary", response_model=AIUsageSummaryResponse)
def get_usage_summary(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
) -> AIUsageSummaryResponse:
    return _summary(db, ctx.company_id)


@router.patch("/budget", response_model=AIUsageSummaryResponse)
def update_usage_budget(
    body: AIUsageBudgetUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
) -> AIUsageSummaryResponse:
    AIUsageBudgetRepository(db).set(ctx.company_id, body.monthly_token_budget)
    log_audit(
        db,
        actor=ctx.user,
        action="budget.set",
        target_type="budget",
        target_id=str(ctx.company_id),
        company_id=ctx.company_id,
        detail={"monthly_token_budget": body.monthly_token_budget},
    )
    return _summary(db, ctx.company_id)
