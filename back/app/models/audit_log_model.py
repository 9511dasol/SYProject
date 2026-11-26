from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import PORTABLE_JSON, Base


class AuditLog(Base):
    """운영 행위 감사 기록 — append-only, 수정·삭제 API 를 만들지 않는다.

    dev 의 기업 데이터 열람(data.view_as_dev)을 포함한 운영 행위(기업·계정·예산
    변경 등)를 남긴다. 행위자·대상에 FK 를 걸지 않는 이유: 계정이나 기업이 삭제된
    뒤에도 "누가 무엇을 했는지"는 남아야 한다 — 그래서 이메일·역할도 시점 스냅샷으로
    복사해 둔다.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        # dev 페이지의 "이 기업에 무슨 일이 있었나" 조회 경로.
        Index("ix_audit_company_created", "company_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    actor_user_id: Mapped[int] = mapped_column(Integer, index=True)
    actor_email: Mapped[str] = mapped_column(String(255), default="")
    actor_role: Mapped[str] = mapped_column(String(10), default="")
    # "company.create" | "user.role_change" | "budget.set" | "data.view_as_dev" …
    action: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str] = mapped_column(String(30), default="")  # "company" | "user" | …
    # background_tasks 의 PK 가 UUID 문자열이라 대상 ID 는 문자열로 통일한다.
    target_id: Mapped[str] = mapped_column(String(64), default="")
    # 행위의 **대상** 기업. 전역 행위(기능 플래그 변경 등)는 NULL.
    company_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict] = mapped_column(PORTABLE_JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
