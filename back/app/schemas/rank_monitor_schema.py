from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Device = Literal["all", "pc", "mobile"]
WatchStatus = Literal["active", "paused"]
# 스냅샷의 출처 — 보고서 업로드인지 API 자동 수집인지
SnapshotSource = Literal["upload", "api"]
# 발송 결과 — report_log 와 같은 체계
SendStatus = Literal["sent", "error"]

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
    source: SnapshotSource
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
    status: WatchStatus
    breach_streak: int
    # 연속 이탈이 기준에 도달했는지 — 목록 화면의 '하락' 뱃지가 이 값 하나를 본다.
    is_breached: bool
    # 하락을 이미 알린 상태인지 (목표 복귀 시 '회복' 알림이 한 번 나간다)
    alerted: bool
    last_alerted_at: datetime | None
    last_checked_at: datetime | None
    # API 자동 수집 상태 — 연결됐는지, 실패했다면 왜인지
    nv_linked: bool = False          # 광고 계정에서 이 키워드를 찾았는지
    nv_synced_at: datetime | None = None
    last_error_code: str | None = None
    last_error_message: str | None = None
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
    # 기본값을 두지 않는다 — 서버가 항상 채워 보내는데 스키마에 기본값이 있으면
    # OpenAPI 가 "없을 수도 있음"으로 내보내, 프런트가 쓰지 않아도 될 방어 코드를 쓴다.
    alerts: AlertSummary


class CollectResponse(BaseModel):
    """API 자동 수집 결과 — 화면이 "받아왔는지"를 바로 알 수 있게."""

    # 응답 전용 모델이라 기본값을 두지 않는다 — 전부 서버가 채워 보낸다.
    stat_date: date
    collected: int
    resolved: int
    # 광고 계정에서 찾지 못한 감시 키워드 (오타이거나 광고를 내린 키워드)
    not_found: list[str]
    skipped_reason: str | None
    alerts: AlertSummary


class CollectStatus(BaseModel):
    """수집기 설정 상태 — 화면이 안내 문구를 고르는 데 쓴다."""

    configured: bool
    message: str


class BidRowOut(BaseModel):
    position: int
    # 디바이스별 예상 입찰가(원). PC·모바일 차이가 커서 묶지 않는다.
    # None 은 "그 순위 값을 받지 못했다"는 뜻이며, 필드 자체는 항상 내려간다.
    pc: int | None
    mobile: int | None


class BidEstimateResponse(BaseModel):
    keyword: str
    device: Device
    target_rank: float
    rows: list[BidRowOut]
    # 조회할 수 없을 때의 사유 (API 미설정 등). 있으면 rows 는 비어 있다.
    skipped_reason: str | None = None


class KeywordInsightResponse(BaseModel):
    """키워드 경쟁 지표 — 목표 순위가 현실적인지 판단할 근거."""

    keyword: str
    monthly_pc: int | None = None
    monthly_mobile: int | None = None
    # 매체가 숫자 대신 "10 미만"으로 뭉뚱그린 경우 (검색량이 매우 적음)
    pc_low_volume: bool = False
    mobile_low_volume: bool = False
    competition: str | None = None      # "높음" | "중간" | "낮음"
    ad_depth: int | None = None         # 평균 노출 광고 수 = 경쟁 밀도
    ctr_pc: float | None = None
    ctr_mobile: float | None = None
    # 조회하지 못한 사유 (API 미설정·매체가 모르는 키워드 등)
    skipped_reason: str | None = None


class AlertLogOut(BaseModel):
    id: int
    watch_id: int | None
    keyword: str
    device: Device
    alert_type: Literal["drop", "recovered"]
    target_rank: float
    curr_rank: float | None
    prev_rank: float | None
    breach_streak: int
    recipients: str
    status: SendStatus
    error_msg: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertLogListResponse(BaseModel):
    items: list[AlertLogOut]
    total: int


class WatchDeleteResponse(BaseModel):
    id: int
    message: str
