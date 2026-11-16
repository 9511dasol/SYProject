from datetime import datetime
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


class ComparePeriod(BaseModel):
    """기간 비교(MoM·YoY)용 다른 달의 전체 합계. 그 달 데이터가 없으면 응답에서 None."""
    year: int
    month: int
    label: str               # "25년 10월"
    total: MediaSummary


class ReportResponse(BaseModel):
    period: str
    total: MediaSummary
    by_media: list[MediaSummary]
    daily: dict[str, list[MediaDailyRow]]
    comment: str = ""
    comment_updated_at: datetime | None = None
    diff: dict[str, RowDiff] = {}
    undo_id: str = ""
    compare_mom: ComparePeriod | None = None   # 전월
    compare_yoy: ComparePeriod | None = None   # 전년동월


class RowUpsertBody(BaseModel):
    report_date: str          # "YYYY-MM-DD"
    campaign_type: str
    impressions: int = 0
    clicks: int = 0
    cost: float = 0.0
    conversions: int = 0
    conversion_revenue: float = 0.0
    signup: float = 0.0
    purchase: float = 0.0
    apply: float = 0.0


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
