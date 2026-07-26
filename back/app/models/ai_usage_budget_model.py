from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AIUsageBudget(Base):
    """AI 도구(Gemini) 월간 토큰 예산 — 관리자가 설정하는 내부 참고용 목표치(싱글턴, id=1).

    Google 쪽 실제 과금·쿼터와는 무관하며, 우리가 기록한 사용량을 이 값과 비교해
    '이번 달 얼마나 썼고 얼마나 남았는지'를 자체적으로 보여주기 위한 값이다.
    """

    __tablename__ = "ai_usage_budget"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    monthly_token_budget: Mapped[int] = mapped_column(default=0)  # 0 = 미설정
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
