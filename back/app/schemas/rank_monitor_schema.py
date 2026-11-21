from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Device = Literal["all", "pc", "mobile"]

# 대량 등록 상한 — 한 번에 이보다 많으면 엑셀을 나눠 올리는 게 실패 추적에도 낫다.
MAX_BULK_ITEMS = 500


class WatchCreateItem(BaseModel):
    keyword: str = Field(min_length=1, max_length=100)
    device: Device = "all"
    target_rank: float = Field(default=3.0, ge=1, le=100)
    tolerance: float = Field(default=0.5, ge=0, le=20)
    breaches_required: int = Field(default=2, ge=1, le=10)
    cooldown_hours: int = Field(default=24, ge=1, le=720)
    alert_on_no_impression: bool = True
    color_tag: str | None = Field(default=None, max_length=10)

    @field_validator("keyword")
    @classmethod
    def _strip(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("키워드가 비어 있습니다.")
        return stripped


class WatchBulkCreateRequest(BaseModel):
    items: list[WatchCreateItem] = Field(min_length=1, max_length=MAX_BULK_ITEMS)


class WatchCreateResult(BaseModel):
    """행별 결과 — 일부 실패해도 전체를 되돌리지 않고 사유를 행 단위로 알린다."""

    keyword: str
    device: Device
    status: Literal["created", "skipped", "error"]
    reason: str | None = None
    id: int | None = None


class WatchBulkCreateResponse(BaseModel):
    results: list[WatchCreateResult]
    created: int
    skipped: int
    errors: int


class WatchUpdate(BaseModel):
    """부분 수정 — 보낸 필드만 반영한다."""

    target_rank: float | None = Field(default=None, ge=1, le=100)
    tolerance: float | None = Field(default=None, ge=0, le=20)
    breaches_required: int | None = Field(default=None, ge=1, le=10)
    cooldown_hours: int | None = Field(default=None, ge=1, le=720)
    alert_on_no_impression: bool | None = None
    color_tag: str | None = Field(default=None, max_length=10)
    status: Literal["active", "paused"] | None = None


class SnapshotOut(BaseModel):
    stat_date: date
    avg_rank: float | None
    impressions: int
    clicks: int
    source: str
    collected_at: datetime | None = None

    model_config = {"from_attributes": True}


class WatchOut(BaseModel):
    id: int
    keyword: str
    device: Device
    target_rank: float
    tolerance: float
    breaches_required: int
    cooldown_hours: int
    alert_on_no_impression: bool
    color_tag: str | None
    status: str
    breach_streak: int
    # 연속 이탈이 기준에 도달했는지 — 목록 화면의 '하락' 뱃지가 이 값 하나를 본다.
    is_breached: bool
    # 하락을 이미 알린 상태인지 (목표 복귀 시 '회복' 알림이 한 번 나간다)
    alerted: bool
    last_alerted_at: datetime | None
    last_checked_at: datetime | None
    latest: SnapshotOut | None = None


class WatchListResponse(BaseModel):
    items: list[WatchOut]
    total: int


class WatchHistoryResponse(BaseModel):
    watch: WatchOut
    items: list[SnapshotOut]


class AlertSummary(BaseModel):
    """적재·평가 직후의 알림 결과 — 화면이 "알림이 나갔는지"를 바로 알 수 있게."""

    drops: int = 0
    recoveries: int = 0
    sent: bool = False
    # 보낼 것이 있었지만 못 보낸 이유 (수신자 미설정 등). 없으면 None.
    skipped_reason: str | None = None


class SnapshotUploadResponse(BaseModel):
    stat_date: date
    matched_watches: int
    inserted: int
    updated: int
    # 보고서에는 있는데 감시 등록이 안 된 키워드 — "이것도 감시할까요" 제안 재료.
    unmatched_keywords: list[str]
    # 감시 중인데 이번 보고서에 데이터가 없던 키워드 — 보고서 범위 점검 안내용.
    watches_no_data: list[str]
    alerts: AlertSummary = Field(default_factory=AlertSummary)


class AlertLogOut(BaseModel):
    id: int
    watch_id: int | None
    keyword: str
    device: str
    alert_type: Literal["drop", "recovered"]
    target_rank: float
    curr_rank: float | None
    prev_rank: float | None
    breach_streak: int
    recipients: str
    status: str
    error_msg: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertLogListResponse(BaseModel):
    items: list[AlertLogOut]
    total: int


class WatchDeleteResponse(BaseModel):
    id: int
    message: str
