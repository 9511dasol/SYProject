from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReportLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    curr_year: int
    curr_month: int
    prev_year: int
    prev_month: int
    recipients: str  # 쉼표로 이어붙인 수신자 목록
    subject: str
    status: str  # "sent" | "error"
    error_msg: str | None = None
    created_at: datetime


class ReportLogListResponse(BaseModel):
    items: list[ReportLogOut]
    total: int
    # 상태별 전체 건수 — 필터와 무관하게 화면 상단 요약에 쓴다
    counts: dict[str, int]


class ReportResendResponse(BaseModel):
    status: str  # "sent"
    recipients: list[str]
    # 재발송으로 새로 남은 로그 (원래 실패 기록은 이력 보존을 위해 그대로 둔다)
    log: ReportLogOut
