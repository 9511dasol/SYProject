from datetime import datetime

from sqlalchemy.orm import Session

from app.models.background_task_model import BackgroundTask

_UNSET = object()


class BackgroundTaskRepository:
    """background_tasks 테이블 CRUD. 커밋은 호출자(주로 app.services.task_store)가 담당한다."""

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        task_id: str,
        kind: str,
        status: str = "pending",
        progress: int = 0,
        message: str = "",
        result: dict | None = None,
        user_id: int | None = None,
    ) -> BackgroundTask:
        task = BackgroundTask(
            id=task_id,
            kind=kind,
            status=status,
            progress=progress,
            message=message,
            result=result or {},
            user_id=user_id,
        )
        self.db.add(task)
        return task

    def get(self, task_id: str, *, kind: str | None = None) -> BackgroundTask | None:
        task = self.db.get(BackgroundTask, task_id)
        if task is None or (kind is not None and task.kind != kind):
            return None
        return task

    def update(
        self,
        task_id: str,
        *,
        status: str | None = None,
        progress: int | None = None,
        message: str | None = None,
        error: str | None = None,
        cancelled: bool | None = None,
        result_patch: dict | None = None,
        result_blob: bytes | None | object = _UNSET,
    ) -> BackgroundTask | None:
        task = self.db.get(BackgroundTask, task_id)
        if task is None:
            return None

        if status is not None:
            task.status = status
        if progress is not None:
            task.progress = progress
        if message is not None:
            task.message = message
        if error is not None:
            task.error = error
        if cancelled is not None:
            task.cancelled = cancelled
        if result_patch:
            # JSONB는 in-place 변경을 감지하지 못하므로 항상 새 dict로 교체한다.
            task.result = {**(task.result or {}), **result_patch}
        if result_blob is not _UNSET:
            task.result_blob = result_blob  # type: ignore[assignment]
        return task

    def delete(self, task_id: str) -> None:
        task = self.db.get(BackgroundTask, task_id)
        if task is not None:
            self.db.delete(task)

    def purge_older_than(self, cutoff: datetime) -> int:
        deleted = (
            self.db.query(BackgroundTask)
            .filter(BackgroundTask.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        return int(deleted)
