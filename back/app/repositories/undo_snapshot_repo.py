from datetime import datetime

from sqlalchemy.orm import Session

from app.models.undo_snapshot_model import UndoSnapshot


class UndoSnapshotRepository:
    """undo_snapshots 테이블 CRUD. 커밋은 호출자가 담당한다."""

    def __init__(self, db: Session):
        self.db = db

    def create(self, undo_id: str, rows: list[dict]) -> UndoSnapshot:
        snapshot = UndoSnapshot(id=undo_id, rows=rows)
        self.db.add(snapshot)
        return snapshot

    def get(self, undo_id: str) -> UndoSnapshot | None:
        return self.db.get(UndoSnapshot, undo_id)

    def delete(self, undo_id: str) -> None:
        snapshot = self.db.get(UndoSnapshot, undo_id)
        if snapshot is not None:
            self.db.delete(snapshot)

    def purge_older_than(self, cutoff: datetime) -> int:
        deleted = (
            self.db.query(UndoSnapshot)
            .filter(UndoSnapshot.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        return int(deleted)
