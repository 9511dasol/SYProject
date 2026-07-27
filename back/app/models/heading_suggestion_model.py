from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HeadingSuggestion(Base):
    """헤딩 문구 추천 생성 결과 (사용자별 히스토리).

    페이지를 떠났다 다시 들어와도 이전에 생성한 문구를 다시 볼 수 있도록
    생성 시점의 문구 묶음을 통째로 저장한다. 원본 이미지는 저장하지 않으며
    파일명만 참고용으로 남긴다.
    """

    __tablename__ = "heading_suggestions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    image_filename: Mapped[str] = mapped_column(String(255), default="")
    # Supabase Storage 내 512px 썸네일의 object path (예: "headings/3/ab12.jpg"). 없으면 NULL.
    image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # [{"id": 1, "platform": "Instagram", "text": "...", "desc": "..."}, ...]
    headings: Mapped[list[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    @property
    def has_image(self) -> bool:
        return bool(self.image_path)
