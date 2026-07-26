from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ai_tool_usage_log_model import AIToolUsageLog
from app.models.user_model import User


class AIToolUsageLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user: User,
        tool: str,
        image_filename: str,
        prompt: str = "",
        prompt_tokens: int | None = None,
        output_tokens: int | None = None,
        total_tokens: int | None = None,
    ) -> None:
        self.db.add(
            AIToolUsageLog(
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

    def list_logs(self, *, tool: str | None = None, limit: int = 50, offset: int = 0) -> list[AIToolUsageLog]:
        query = self.db.query(AIToolUsageLog).order_by(AIToolUsageLog.created_at.desc())
        if tool:
            query = query.filter(AIToolUsageLog.tool == tool)
        return query.offset(offset).limit(limit).all()

    def count(self, *, tool: str | None = None) -> int:
        query = self.db.query(AIToolUsageLog)
        if tool:
            query = query.filter(AIToolUsageLog.tool == tool)
        return query.count()

    def sum_tokens_since(self, since: datetime) -> int:
        total = (
            self.db.query(func.coalesce(func.sum(AIToolUsageLog.total_tokens), 0))
            .filter(AIToolUsageLog.created_at >= since)
            .scalar()
        )
        return int(total or 0)

    def sum_tokens_by_tool_since(self, since: datetime) -> dict[str, int]:
        rows = (
            self.db.query(AIToolUsageLog.tool, func.coalesce(func.sum(AIToolUsageLog.total_tokens), 0))
            .filter(AIToolUsageLog.created_at >= since)
            .group_by(AIToolUsageLog.tool)
            .all()
        )
        return {tool: int(total) for tool, total in rows}
