from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReportLog(Base):
    """리포트 메일 발송 이력"""

    __tablename__ = "report_log"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    curr_year: Mapped[int]
    curr_month: Mapped[int]
    prev_year: Mapped[int]
    prev_month: Mapped[int]
    recipients: Mapped[str] = mapped_column(Text, default="")
    subject: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="sent")  # "sent" | "error"
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
