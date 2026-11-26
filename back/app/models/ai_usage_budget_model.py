from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AIUsageBudget(Base):
    """AI 도구 월간 토큰 예산 — 기업당 1행.

    Google 쪽 실제 과금·쿼터와는 무관하며, 우리가 기록한 사용량을 이 값과 비교해
    '이번 달 얼마나 썼고 얼마나 남았는지'를 자체적으로 보여주기 위한 값이다.

    예전에는 전역 싱글턴(id=1)이었다 — 멀티테넌시 전환(0014)에서 기존 id=1 행이
    sy(company_id=1)의 예산이 됐다. "기업당 1행"은 아래 unique 제약이 강제한다.
    """

    __tablename__ = "ai_usage_budget"
    __table_args__ = (
        UniqueConstraint("company_id", name="uq_ai_budget_company"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # 어느 기업의 예산인지 — 기본값 없음, 설정 경로가 반드시 명시한다.
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE")
    )
    monthly_token_budget: Mapped[int] = mapped_column(default=0)  # 0 = 미설정
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
