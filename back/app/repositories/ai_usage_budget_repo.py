from sqlalchemy.orm import Session

from app.models.ai_usage_budget_model import AIUsageBudget


class AIUsageBudgetRepository:
    """기업당 1행의 월간 토큰 예산 — "기업당 1행"은 uq_ai_budget_company 가 강제한다.

    예전에는 전역 싱글턴(id=1)이었다. 멀티테넌시 전환(0014)으로 기존 행이
    sy(company_id=1)의 예산이 됐고, 조회·설정 모두 기업 기준이다.
    """

    def __init__(self, db: Session):
        self.db = db

    def _row(self, company_id: int) -> AIUsageBudget | None:
        return (
            self.db.query(AIUsageBudget)
            .filter(AIUsageBudget.company_id == company_id)
            .first()
        )

    def get(self, company_id: int) -> int:
        row = self._row(company_id)
        return row.monthly_token_budget if row else 0

    def set(self, company_id: int, monthly_token_budget: int) -> int:
        row = self._row(company_id)
        if row:
            row.monthly_token_budget = monthly_token_budget
        else:
            self.db.add(
                AIUsageBudget(company_id=company_id, monthly_token_budget=monthly_token_budget)
            )
        self.db.commit()
        return monthly_token_budget
