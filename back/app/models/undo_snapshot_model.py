from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import PORTABLE_JSON, Base



class UndoSnapshot(Base):
    """업로드 되돌리기용 이전 행 스냅샷.

    예전에는 marketing_repo의 모듈 전역 dict(undo_store)에 담았지만, 업로드를 처리한
    인스턴스와 되돌리기 요청을 받는 인스턴스가 다를 수 있어(그리고 재시작하면 사라져서)
    "되돌리기" 버튼이 임의로 실패했다. 만료(TTL)는 created_at 기준으로 정리한다.
    """

    __tablename__ = "undo_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # uuid4
    # 소속 기업 — 생성 경로가 반드시 명시한다(기본값 없음: 빠뜨리면 조용히 sy 로
    # 귀속되는 대신 그 자리에서 실패한다).
    company_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
    )
    # 덮어쓰기 전의 marketing_data 행들 (JSON 직렬화를 위해 date→ISO 문자열로 변환해 저장)
    rows: Mapped[list[dict]] = mapped_column(PORTABLE_JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
