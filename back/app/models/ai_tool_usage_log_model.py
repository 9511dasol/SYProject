from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AIToolUsageLog(Base):
    """이미지 정제 · 리사이저(AI 업스케일) · 헤딩 문구 추천 — Gemini 호출 사용 이력 (관리자 전용 조회)"""

    __tablename__ = "ai_tool_usage_logs"
    __table_args__ = (
        # 기업별 월 예산 게이트가 (company_id, created_at >= :since) 로 합산한다.
        Index("ix_ai_usage_company_created", "company_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 소속 기업 — 기록 창구(log_ai_usage)가 반드시 명시한다(기본값 없음).
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    tool: Mapped[str] = mapped_column(String(30), index=True)  # "image_filter" | "image_resize" | "heading_suggest"
    image_filename: Mapped[str] = mapped_column(String(255), default="")
    prompt: Mapped[str] = mapped_column(Text, default="")
    # Gemini 응답의 usage_metadata — 얻지 못한 경우(구버전 응답 등) NULL
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 월 예산 게이트(require_ai_budget)가 AI 호출마다 created_at >= :since 로 토큰을
    # 합산한다 — 인덱스가 없으면 로그가 쌓일수록 모든 AI 요청이 같이 느려진다.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
