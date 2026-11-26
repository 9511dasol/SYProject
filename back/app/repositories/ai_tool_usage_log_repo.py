from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ai_tool_usage_log_model import AIToolUsageLog
from app.models.user_model import User


class AIToolUsageLogRepository:
    """AI 사용 이력 — 모든 조회·집계가 기업(company_id) 범위다.

    예산 게이트와 관리자 사용량 화면이 같은 합계를 말해야 하므로, 기업 필터를
    "기억해서 거는" 방식이 아니라 메서드 시그니처가 강제하는 방식으로 둔다.
    """

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user: User,
        company_id: int,
        tool: str,
        image_filename: str,
        prompt: str = "",
        prompt_tokens: int | None = None,
        output_tokens: int | None = None,
        total_tokens: int | None = None,
    ) -> None:
        self.db.add(
            AIToolUsageLog(
                company_id=company_id,
                user_id=user.id,
                user_email=user.email,
                tool=tool,
                image_filename=image_filename,
                prompt=prompt,
                prompt_tokens=prompt_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
            )
        )
        self.db.commit()

    def _scoped(self, company_id: int):
        return self.db.query(AIToolUsageLog).filter(AIToolUsageLog.company_id == company_id)

    def list_logs(
        self, *, company_id: int, tool: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[AIToolUsageLog]:
        query = self._scoped(company_id).order_by(AIToolUsageLog.created_at.desc())
        if tool:
            query = query.filter(AIToolUsageLog.tool == tool)
        return query.offset(offset).limit(limit).all()

    def count(self, *, company_id: int, tool: str | None = None) -> int:
        query = self._scoped(company_id)
        if tool:
            query = query.filter(AIToolUsageLog.tool == tool)
        return query.count()

    def sum_tokens_since(self, since: datetime, *, company_id: int) -> int:
        total = (
            self.db.query(func.coalesce(func.sum(AIToolUsageLog.total_tokens), 0))
            .filter(
                AIToolUsageLog.company_id == company_id,
                AIToolUsageLog.created_at >= since,
            )
            .scalar()
        )
        return int(total or 0)

    def sum_tokens_by_tool_since(self, since: datetime, *, company_id: int) -> dict[str, int]:
        rows = (
            self.db.query(AIToolUsageLog.tool, func.coalesce(func.sum(AIToolUsageLog.total_tokens), 0))
            .filter(
                AIToolUsageLog.company_id == company_id,
                AIToolUsageLog.created_at >= since,
            )
            .group_by(AIToolUsageLog.tool)
            .all()
        )
        return {tool: int(total) for tool, total in rows}
