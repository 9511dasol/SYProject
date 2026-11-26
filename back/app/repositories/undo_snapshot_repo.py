from datetime import datetime

from sqlalchemy.orm import Session

from app.models.undo_snapshot_model import UndoSnapshot


class UndoSnapshotRepository:
    """undo_snapshots 테이블 CRUD. 커밋은 호출자가 담당한다."""

    def __init__(self, db: Session):
        self.db = db

    def create(self, undo_id: str, rows: list[dict], *, company_id: int) -> UndoSnapshot:
        # 소속 기업을 함께 남긴다 — 되돌리기는 같은 기업에서만 가능하다(_pop_undo_snapshot).
        snapshot = UndoSnapshot(id=undo_id, rows=rows, company_id=company_id)
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
