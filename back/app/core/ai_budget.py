"""월간 AI 토큰 예산 강제.

관리자 페이지에서 설정한 `ai_usage_budget.monthly_token_budget`은 지금까지 화면에
"이만큼 썼다"고 보여주기만 할 뿐 초과해도 아무 일이 없었다. 실제로 호출을 막아야
예산이 의미를 갖는다.

정책
  - budget <= 0 이면 "미설정"으로 보고 제한하지 않는다 (기존 동작 유지).
  - 이번 달 누적 total_tokens가 예산 이상이면 429로 차단한다.
  - 사용량은 호출이 끝난 뒤에 기록되므로, 마지막 한 건은 예산을 조금 넘길 수 있다.
    (호출 전에 토큰 수를 알 수 없어 정확한 선차감은 불가능하다.)
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_db
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.repositories.ai_usage_budget_repo import AIUsageBudgetRepository


def current_month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def check_ai_budget(db: Session) -> None:
    """예산을 초과했으면 429를 발생시킨다."""
    budget = AIUsageBudgetRepository(db).get()
    if budget <= 0:
        return

    used = AIToolUsageLogRepository(db).sum_tokens_since(current_month_start())
    if used >= budget:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"이번 달 AI 토큰 예산({budget:,})을 모두 사용했습니다"
                f" (현재 {used:,}). 관리자에게 예산 상향을 요청해 주세요."
            ),
        )


def require_ai_budget(db: Session = Depends(get_db)) -> None:
    """AI를 호출하는 라우터의 dependencies에 걸어 쓰는 의존성."""
    check_ai_budget(db)
