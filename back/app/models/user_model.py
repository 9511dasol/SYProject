from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # dev(플랫폼 운영자)만 무소속(NULL), 나머지 역할은 반드시 기업 소속.
        CheckConstraint(
            "(role = 'dev') = (company_id IS NULL)", name="ck_users_dev_no_company"
        ),
        # 기업당 admin 정확히 1개 — 애플리케이션 버그로도 깨질 수 없게 DB 가 강제한다.
        Index(
            "uq_one_admin_per_company",
            "company_id",
            unique=True,
            postgresql_where=text("role = 'admin'"),
            sqlite_where=text("role = 'admin'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(default="")
    hashed_password: Mapped[str] = mapped_column()
    role: Mapped[str] = mapped_column(default="member")  # "dev" | "admin" | "member" | "trial"
    # 소속 기업 — dev 만 NULL(ck_users_dev_no_company). 기본값이 없으므로 계정 생성
    # 경로는 반드시 소속을 명시해야 한다.
    company_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # 로그인 무차별 대입 방어 — 연속 실패 횟수와 잠금 해제 시각.
    # IP 기반 rate limit은 X-Forwarded-For 위조로 우회할 수 있어서, 계정 단위로도 센다.
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
