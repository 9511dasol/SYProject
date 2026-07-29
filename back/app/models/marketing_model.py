from datetime import date, datetime

from sqlalchemy import JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# 운영은 Postgres(JSONB), 테스트는 SQLite — SQLite에는 JSONB가 없어 JSON으로 떨어진다.
_JSON = JSONB().with_variant(JSON(), "sqlite")


class MarketingPeriodMeta(Base):
    """연월별 Excel summary 부가 정보 — 코멘트(B32)와 매체별 예산."""

    __tablename__ = "marketing_period_meta"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_period_year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    year: Mapped[int] = mapped_column(index=True)
    month: Mapped[int] = mapped_column(index=True)
    comment: Mapped[str] = mapped_column(default="")
    comment_updated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    # Supabase Storage 내 엑셀 원본의 object path (예: "2026/06/report.xlsx")
    excel_path: Mapped[str | None] = mapped_column(nullable=True)
    # summary 시트 ■ 매체별 예산 — {"네이버SA": 19000000, "카카오SA": 50000, ...}.
    # 광고 실적과 달리 업로드 엑셀에 없는 값이라 관리자가 기간별로 입력한다.
    media_budgets: Mapped[dict | None] = mapped_column(_JSON, nullable=True)


class MarketingData(Base):
    __tablename__ = "marketing_data"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_date: Mapped[date] = mapped_column(index=True)
    campaign_type: Mapped[str] = mapped_column(index=True)
    impressions: Mapped[int] = mapped_column(default=0)
    clicks: Mapped[int] = mapped_column(default=0)
    cost: Mapped[float] = mapped_column(default=0.0)
    conversions: Mapped[int] = mapped_column(default=0)
    conversion_revenue: Mapped[float] = mapped_column(default=0.0)
    signup: Mapped[float] = mapped_column(default=0.0)
    purchase: Mapped[float] = mapped_column(default=0.0)
    apply: Mapped[float] = mapped_column(default=0.0)