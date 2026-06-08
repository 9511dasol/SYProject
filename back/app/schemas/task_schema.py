from typing import Literal

from pydantic import BaseModel, Field


class TaskStatusResponse(BaseModel):
    task_id: str
    status: Literal["processing", "completed", "failed"]
    progress: int = Field(ge=0, le=100)
    message: str
    step: int | None = None
    total_steps: int | None = None
