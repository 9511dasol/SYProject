from datetime import datetime

from pydantic import BaseModel, Field


class AIToolUsageLogOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    tool: str
    image_filename: str
    prompt: str
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AIToolUsageLogListResponse(BaseModel):
    items: list[AIToolUsageLogOut]
    total: int


class AIUsageSummaryResponse(BaseModel):
    month: str  # "YYYY-MM"
    total_tokens: int
    by_tool: dict[str, int]
    monthly_token_budget: int  # 0 = 미설정


class AIUsageBudgetUpdate(BaseModel):
    monthly_token_budget: int = Field(ge=0)
