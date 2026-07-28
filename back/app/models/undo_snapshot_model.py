from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UndoSnapshot(Base):
    """업로드 되돌리기용 이전 행 스냅샷.

    예전에는 marketing_repo의 모듈 전역 dict(undo_store)에 담았지만, 업로드를 처리한
    인스턴스와 되돌리기 요청을 받는 인스턴스가 다를 수 있어(그리고 재시작하면 사라져서)
    "되돌리기" 버튼이 임의로 실패했다. 만료(TTL)는 created_at 기준으로 정리한다.
    """

    __tablename__ = "undo_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # uuid4
    # 덮어쓰기 전의 marketing_data 행들 (JSON 직렬화를 위해 date→ISO 문자열로 변환해 저장)
    rows: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
