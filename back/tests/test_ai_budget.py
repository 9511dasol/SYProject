"""월간 AI 토큰 예산 게이트.

관리자가 설정한 예산이 실제로 호출을 막는지 확인한다 (예전에는 표시용일 뿐이었다).
"""

import pytest
from fastapi import HTTPException

from app.core import ai_budget


def _patch(mocker, *, budget: int, used: int) -> None:
    mocker.patch.object(
        ai_budget, "AIUsageBudgetRepository",
        return_value=mocker.Mock(get=mocker.Mock(return_value=budget)),
    )
    mocker.patch.object(
        ai_budget, "AIToolUsageLogRepository",
        return_value=mocker.Mock(sum_tokens_since=mocker.Mock(return_value=used)),
    )


def test_unset_budget_allows_call(mocker):
    """budget=0 은 '미설정' — 제한하지 않는다 (기존 동작 유지)."""
    _patch(mocker, budget=0, used=10_000_000)
    ai_budget.check_ai_budget(mocker.Mock())


def test_under_budget_allows_call(mocker):
    _patch(mocker, budget=1000, used=999)
    ai_budget.check_ai_budget(mocker.Mock())


def test_reaching_budget_blocks_call(mocker):
    _patch(mocker, budget=1000, used=1000)
    with pytest.raises(HTTPException) as exc_info:
        ai_budget.check_ai_budget(mocker.Mock())
    assert exc_info.value.status_code == 429


def test_over_budget_blocks_call(mocker):
    _patch(mocker, budget=1000, used=2500)
    with pytest.raises(HTTPException) as exc_info:
        ai_budget.check_ai_budget(mocker.Mock())
    assert exc_info.value.status_code == 429
    assert "예산" in exc_info.value.detail


def test_current_month_start_is_first_day_midnight_utc():
    start = ai_budget.current_month_start()
    assert (start.day, start.hour, start.minute, start.second) == (1, 0, 0, 0)
    assert start.tzinfo is not None
