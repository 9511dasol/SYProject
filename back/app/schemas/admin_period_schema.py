from datetime import datetime

from pydantic import BaseModel


class PeriodOverviewItem(BaseModel):
    year: int
    month: int
    row_count: int
    first_date: str | None = None  # "YYYY-MM-DD"
    last_date: str | None = None
    has_comment: bool
    comment_updated_at: datetime | None = None
    has_excel: bool


class PeriodOverviewResponse(BaseModel):
    items: list[PeriodOverviewItem]
    total_rows: int


class PeriodDeleteResponse(BaseModel):
    year: int
    month: int
    deleted_rows: int
    deleted_meta: bool
    deleted_excel: bool
    message: str
