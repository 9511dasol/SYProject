from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AIToolUsageLogOut(BaseModel):
    # Pydantic v2 에서 `class Config` 는 폐기 예정 — 프로젝트 전체를 ConfigDict 로 맞춘다
    model_config = ConfigDict(from_attributes=True)

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
