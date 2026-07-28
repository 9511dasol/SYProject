from datetime import datetime

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(default="")
    hashed_password: Mapped[str] = mapped_column()
    role: Mapped[str] = mapped_column(default="user")  # "user" | "admin"
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # 로그인 무차별 대입 방어 — 연속 실패 횟수와 잠금 해제 시각.
    # IP 기반 rate limit은 X-Forwarded-For 위조로 우회할 수 있어서, 계정 단위로도 센다.
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
