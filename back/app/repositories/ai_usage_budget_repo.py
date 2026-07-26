from sqlalchemy.orm import Session

from app.models.ai_usage_budget_model import AIUsageBudget

_SINGLETON_ID = 1


class AIUsageBudgetRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self) -> int:
        row = self.db.get(AIUsageBudget, _SINGLETON_ID)
        return row.monthly_token_budget if row else 0

    def set(self, monthly_token_budget: int) -> int:
        row = self.db.get(AIUsageBudget, _SINGLETON_ID)
        if row:
            row.monthly_token_budget = monthly_token_budget
        else:
            self.db.add(AIUsageBudget(id=_SINGLETON_ID, monthly_token_budget=monthly_token_budget))
        self.db.commit()
        return monthly_token_budget
