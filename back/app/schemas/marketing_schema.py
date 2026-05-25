from enum import Enum
from pydantic import BaseModel


class MediaDailyRow(BaseModel):
    date: str
    impressions: float
    clicks: float
    cost: float
    ctr: float
    cpc: float
    total_conv: float
    conv_rate: float
    conv_cost: float
    signup: float
    purchase: float
    revenue: float
    apply: float
    roas: float


class MediaSummary(BaseModel):
    label: str
    impressions: float
    clicks: float
    cost: float
    ctr: float
    cpc: float
    total_conv: float
    signup: float
    purchase: float
    revenue: float
    apply: float
    roas: float


class RowDiff(BaseModel):
    added: list[str] = []    # "YYYY-MM-DD" 형식
    updated: list[str] = []


class ReportResponse(BaseModel):
    period: str
    total: MediaSummary
    by_media: list[MediaSummary]
    daily: dict[str, list[MediaDailyRow]]
    comment: str = ""
    diff: dict[str, RowDiff] = {}
    undo_id: str = ""


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisResponse(BaseModel):
    status: str
    message: str
    processed_rows: int
    ai_comment: str


class UploadTaskResponse(BaseModel):
    task_id: str
    status: TaskStatus
    message: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    processed_rows: int | None = None
    ai_comment: str | None = None
    error: str | None = None
