from sqlalchemy.orm import Session

from app.models.report_log_model import ReportLog


class ReportLogRepository:
    """발송 이력 — company_id 가 있으면(요청 경로) 그 기업의 기록만 보인다.

    None 은 시스템 경로 전용이다. 요청 핸들러에서 None 으로 만들면 격리가 깨진다.
    """

    def __init__(self, db: Session, company_id: int | None = None):
        self.db = db
        self.company_id = company_id

    def _filtered(self, status: str | None):
        query = self.db.query(ReportLog)
        if self.company_id is not None:
            query = query.filter(ReportLog.company_id == self.company_id)
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
            self._filtered(None)
            .with_entities(ReportLog.status, func.count(ReportLog.id))
            .group_by(ReportLog.status)
            .all()
        )
        return {status: int(total) for status, total in rows}

    def get(self, log_id: int) -> ReportLog | None:
        log = self.db.get(ReportLog, log_id)
        if log is None:
            return None
        # 타기업 기록은 "없는 것"이다 — 호출부가 그대로 404 를 낸다.
        if self.company_id is not None and log.company_id != self.company_id:
            return None
        return log
