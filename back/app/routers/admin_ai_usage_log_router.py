from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import get_db, require_admin
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.repositories.ai_usage_budget_repo import AIUsageBudgetRepository
from app.schemas.ai_tool_usage_log_schema import (
    AIToolUsageLogListResponse,
    AIUsageBudgetUpdate,
    AIUsageSummaryResponse,
)

router = APIRouter(prefix="/api/admin/ai-usage-logs", tags=["admin-ai-usage-logs"])


def _current_month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("", response_model=AIToolUsageLogListResponse)
def list_ai_usage_logs(
    tool: str | None = Query(None, description="image_filter | image_resize | heading_suggest"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> AIToolUsageLogListResponse:
    repo = AIToolUsageLogRepository(db)
    items = repo.list_logs(tool=tool, limit=limit, offset=offset)
    total = repo.count(tool=tool)
    return AIToolUsageLogListResponse(items=items, total=total)


@router.get("/summary", response_model=AIUsageSummaryResponse)
def get_usage_summary(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> AIUsageSummaryResponse:
    month_start = _current_month_start()
    log_repo = AIToolUsageLogRepository(db)
    return AIUsageSummaryResponse(
        month=month_start.strftime("%Y-%m"),
        total_tokens=log_repo.sum_tokens_since(month_start),
        by_tool=log_repo.sum_tokens_by_tool_since(month_start),
        monthly_token_budget=AIUsageBudgetRepository(db).get(),
    )


@router.patch("/budget", response_model=AIUsageSummaryResponse)
def update_usage_budget(
    body: AIUsageBudgetUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> AIUsageSummaryResponse:
    AIUsageBudgetRepository(db).set(body.monthly_token_budget)

    month_start = _current_month_start()
    log_repo = AIToolUsageLogRepository(db)
    return AIUsageSummaryResponse(
        month=month_start.strftime("%Y-%m"),
        total_tokens=log_repo.sum_tokens_since(month_start),
        by_tool=log_repo.sum_tokens_by_tool_since(month_start),
        monthly_token_budget=body.monthly_token_budget,
    )
