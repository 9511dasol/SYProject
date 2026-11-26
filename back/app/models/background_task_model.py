from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import PORTABLE_JSON, Base



class BackgroundTask(Base):
    """백그라운드 작업의 진행 상태 — 프로세스 메모리가 아닌 DB에 보관한다.

    Cloud Run처럼 인스턴스가 여러 개로 늘어나거나 유휴 시 0개로 줄어드는 환경에서는
    프로세스 메모리 dict에 상태를 두면 (1) 폴링 요청이 다른 인스턴스로 라우팅돼 404가 나고
    (2) 인스턴스가 재시작하면 진행 중이던 작업이 통째로 사라진다.
    모든 인스턴스가 공유하는 DB에 두면 두 문제가 함께 해결된다.

    `kind` 별로 채워지는 필드가 다르므로 공통 필드(status/progress/message/error)만
    컬럼으로 두고, 종류별 결과는 `result` JSONB에 담는다.
    """

    __tablename__ = "background_tasks"
    __table_args__ = (
        Index("ix_bg_tasks_company_created", "company_id", "created_at"),
    )

    # uuid4 문자열 (기존 인메모리 스토어의 task_id 형식을 그대로 유지)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # 소속 기업 — 테넌트 테이블 중 유일하게 NULL 허용: 어느 기업 것도 아닌
    # 전역 시스템 잡(trial 정리, 자동 수집 크론 등)이 이 테이블에 같이 기록된다.
    company_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True
    )
    # "marketing_upload" | "marketing_export" | "marketing_save" | "generic"
    kind: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 사용자가 취소를 요청했는지 — 워커 루프가 단계마다 확인한다
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    # 종류별 추가 결과 (saved_rows, undo_id, filename, step, total_steps 등)
    result: Mapped[dict] = mapped_column(PORTABLE_JSON, default=dict)
    # Supabase Storage가 설정되지 않은 로컬 환경에서만 쓰는 결과 바이너리 폴백.
    # 운영에서는 Storage에 올리고 result["storage_path"]만 남긴다.
    result_blob: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
