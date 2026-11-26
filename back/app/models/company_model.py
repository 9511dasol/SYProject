from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Company(Base):
    """테넌트(기업) — 모든 업무 데이터의 소속 단위.

    실기업 삭제는 is_active=False(soft delete)가 기본이다. 물리 DELETE 는 체험(trial)
    기업 정리 전용이며, 하위 데이터는 각 테이블의 FK ON DELETE CASCADE 로 함께 지워진다.

    id=1 은 마이그레이션(0012)이 시드하는 첫 기업 "sy" 다. 기존 데이터 전체가 이
    기업으로 백필됐고, 사용자 토큰이 없는 시스템 경로(크론·자동 발송)가 이 id 를
    귀속처로 쓴다(SY_COMPANY_ID) — sy 행을 지우거나 id 를 바꾸면 안 된다.
    """

    __tablename__ = "companies"
    __table_args__ = (
        # 만료된 체험 기업을 정리 잡이 바로 찾는 경로.
        Index("ix_companies_trial_expiry", "is_trial", "expires_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    # False 면 소속 계정 전원이 로그인·토큰 refresh 에서 차단된다.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False)
    # 체험 기업 전용 만료 시각. 경과하면 로그인 차단 + 정리 잡이 물리 삭제한다.
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
