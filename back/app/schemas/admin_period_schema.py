from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.services.excel_service import SUMMARY_BUDGET_ROWS

# 엑셀 summary '■ 매체별 예산' 구간에 자리가 있는 매체 — 여기 없는 이름은 받아도 쓸 곳이 없다.
BUDGET_MEDIA: tuple[str, ...] = tuple(SUMMARY_BUDGET_ROWS)


class PeriodOverviewItem(BaseModel):
    year: int
    month: int
    row_count: int
    first_date: str | None = None  # "YYYY-MM-DD"
    last_date: str | None = None
    has_comment: bool
    comment_updated_at: datetime | None = None
    has_excel: bool
    has_budget: bool = False


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


class MediaBudgetsResponse(BaseModel):
    year: int
    month: int
    budgets: dict[str, float]
    # 이 값을 실제로 가져온 기간 ("2026-06"). 요청한 기간에 저장된 값이 없으면 그 이전
    # 기간에서 이어받으므로, 화면에서 "물려받은 값"임을 알 수 있어야 한다.
    inherited_from: str | None = None
    media: list[str] = Field(default_factory=lambda: list(BUDGET_MEDIA))


class MediaBudgetsUpdate(BaseModel):
    budgets: dict[str, float]

    @field_validator("budgets")
    @classmethod
    def _check(cls, value: dict[str, float]) -> dict[str, float]:
        unknown = sorted(set(value) - set(BUDGET_MEDIA))
        if unknown:
            raise ValueError(f"알 수 없는 매체입니다: {', '.join(unknown)}")
        negative = sorted(k for k, v in value.items() if v < 0)
        if negative:
            raise ValueError(f"예산은 0 이상이어야 합니다: {', '.join(negative)}")
        return value
