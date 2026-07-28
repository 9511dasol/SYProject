from sqlalchemy.orm import Session

from app.models.report_log_model import ReportLog


class ReportLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def _filtered(self, status: str | None):
        query = self.db.query(ReportLog)
        if status:
            query = query.filter(ReportLog.status == status)
        return query

    def list_logs(self, *, status: str | None = None, limit: int = 50, offset: int = 0) -> list[ReportLog]:
        return (
            self._filtered(status)
            .order_by(ReportLog.created_at.desc(), ReportLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count(self, *, status: str | None = None) -> int:
        return self._filtered(status).count()

    def count_by_status(self) -> dict[str, int]:
        """{"sent": n, "error": m} — 화면 상단 요약용."""
        from sqlalchemy import func  # noqa: PLC0415

        rows = (
            self.db.query(ReportLog.status, func.count(ReportLog.id))
            .group_by(ReportLog.status)
            .all()
        )
        return {status: int(total) for status, total in rows}

    def get(self, log_id: int) -> ReportLog | None:
        return self.db.get(ReportLog, log_id)
