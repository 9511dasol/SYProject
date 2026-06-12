from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemSetting(Base):
    """관리자 페이지에서 제어하는 시스템 설정 / 기능 플래그 (key-value)."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str] = mapped_column(default="true")  # "true" | "false"
    description: Mapped[str] = mapped_column(default="")
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
