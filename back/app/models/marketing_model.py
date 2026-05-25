from datetime import date

from sqlalchemy import LargeBinary, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MarketingPeriodMeta(Base):
    """연월별 Excel summary 코멘트 (B32)"""

    __tablename__ = "marketing_period_meta"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_period_year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    year: Mapped[int] = mapped_column(index=True)
    month: Mapped[int] = mapped_column(index=True)
    comment: Mapped[str] = mapped_column(default="")
    excel_content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)


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