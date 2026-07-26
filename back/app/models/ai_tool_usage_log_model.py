from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AIToolUsageLog(Base):
    """이미지 정제 · 리사이저(AI 업스케일) · 헤딩 문구 추천 — Gemini 호출 사용 이력 (관리자 전용 조회)"""

    __tablename__ = "ai_tool_usage_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    tool: Mapped[str] = mapped_column(String(30), index=True)  # "image_filter" | "image_resize" | "heading_suggest"
    image_filename: Mapped[str] = mapped_column(String(255), default="")
    prompt: Mapped[str] = mapped_column(Text, default="")
    # Gemini 응답의 usage_metadata — 얻지 못한 경우(구버전 응답 등) NULL
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
