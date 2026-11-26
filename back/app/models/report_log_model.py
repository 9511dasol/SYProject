from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReportLog(Base):
    """리포트 메일 발송 이력"""

    __tablename__ = "report_log"
    __table_args__ = (
        Index("ix_report_log_company_created", "company_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 소속 기업 — 발송 경로(ReportOrchestrator)가 반드시 명시한다(기본값 없음).
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE")
    )
    curr_year: Mapped[int]
    curr_month: Mapped[int]
    prev_year: Mapped[int]
    prev_month: Mapped[int]
    recipients: Mapped[str] = mapped_column(Text, default="")
    subject: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="sent")  # "sent" | "error"
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )  # 목록 조회가 항상 created_at DESC 정렬
