"""백그라운드 작업 상태 저장소 — DB(background_tasks 테이블) 기반.

예전에는 라우터/서비스 모듈의 전역 dict에 상태를 담았는데, Cloud Run처럼
인스턴스가 여러 개로 늘어나거나 유휴 시 0개로 줄어드는 환경에서는
폴링 요청이 상태를 갖고 있지 않은 인스턴스로 가서 404가 나고, 재시작하면
진행 중이던 작업이 통째로 사라졌다. 모든 인스턴스가 공유하는 DB로 옮긴다.

이 모듈의 함수들은 각자 짧은 수명의 Session을 열고 닫는다 — FastAPI
BackgroundTasks가 스레드풀에서 실행하는 워커에서도 그대로 호출할 수 있어야
하기 때문이다(요청 스코프의 Depends(get_db) 세션은 그때 이미 닫혀 있다).
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.models.background_task_model import BackgroundTask
from app.repositories.background_task_repo import BackgroundTaskRepository
from app.repositories.undo_snapshot_repo import UndoSnapshotRepository

logger = logging.getLogger(__name__)

# 완료/실패한 작업 행을 남겨두는 기간 — 지나면 정리 잡이 삭제한다.
TASK_TTL_HOURS = 24
# 업로드 되돌리기 유효 시간 (기존 인메모리 구현의 30분과 동일)
UNDO_TTL_SECONDS = 1800


def _to_dict(task: BackgroundTask) -> dict:
    """ORM 객체 → 세션 밖에서도 쓸 수 있는 순수 dict."""
    return {
        "id": task.id,
        "kind": task.kind,
        "status": task.status,
        "progress": task.progress,
        "message": task.message,
        "error": task.error,
        "cancelled": task.cancelled,
        "result": dict(task.result or {}),
    }


# ── 작업 생성/조회/갱신 ────────────────────────────────────────────────────────


def create_task(
    kind: str,
    *,
    task_id: str | None = None,
    status: str = "pending",
    progress: int = 0,
    message: str = "",
    result: dict | None = None,
    user_id: int | None = None,
) -> str:
    task_id = task_id or str(uuid.uuid4())
    db = SessionLocal()
    try:
        BackgroundTaskRepository(db).create(
            task_id=task_id,
            kind=kind,
            status=status,
            progress=progress,
            message=message,
            result=result,
            user_id=user_id,
        )
        db.commit()
    finally:
        db.close()
    return task_id


def get_task(task_id: str, *, kind: str | None = None) -> dict | None:
    db = SessionLocal()
    try:
        task = BackgroundTaskRepository(db).get(task_id, kind=kind)
        return _to_dict(task) if task else None
    finally:
        db.close()


def update_task(
    task_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    message: str | None = None,
    error: str | None = None,
    result_patch: dict | None = None,
) -> None:
    db = SessionLocal()
    try:
        BackgroundTaskRepository(db).update(
            task_id,
            status=status,
            progress=progress,
            message=message,
            error=error,
            result_patch=result_patch,
        )
        db.commit()
    finally:
        db.close()


def is_cancelled(task_id: str) -> bool:
    db = SessionLocal()
    try:
        task = BackgroundTaskRepository(db).get(task_id)
        return bool(task and task.cancelled)
    finally:
        db.close()


def cancel_task(task_id: str) -> bool:
    """취소 플래그를 세운다. 대상 작업이 없으면 False."""
    db = SessionLocal()
    try:
        repo = BackgroundTaskRepository(db)
        task = repo.get(task_id)
        if task is None:
            return False
        task.cancelled = True
        if task.status not in ("done", "error", "completed", "failed"):
            task.status = "cancelled"
        db.commit()
        return True
    finally:
        db.close()


def delete_task(task_id: str) -> None:
    db = SessionLocal()
    try:
        BackgroundTaskRepository(db).delete(task_id)
        db.commit()
    finally:
        db.close()


# ── 결과 바이너리 (Storage 미설정 로컬 환경 폴백) ──────────────────────────────


def set_result_blob(task_id: str, content: bytes) -> None:
    db = SessionLocal()
    try:
        BackgroundTaskRepository(db).update(task_id, result_blob=content)
        db.commit()
    finally:
        db.close()


def pop_result_blob(task_id: str) -> bytes | None:
    """결과 바이너리를 꺼내고 즉시 비운다 (1회용 다운로드)."""
    db = SessionLocal()
    try:
        repo = BackgroundTaskRepository(db)
        task = repo.get(task_id)
        if task is None or task.result_blob is None:
            return None
        content = bytes(task.result_blob)
        task.result_blob = None
        db.commit()
        return content
    finally:
        db.close()


# ── 만료 정리 ─────────────────────────────────────────────────────────────────


def purge_expired() -> tuple[int, int]:
    """만료된 작업/되돌리기 스냅샷을 삭제하고 (작업 수, 스냅샷 수)를 반환한다."""
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        tasks = BackgroundTaskRepository(db).purge_older_than(now - timedelta(hours=TASK_TTL_HOURS))
        undos = UndoSnapshotRepository(db).purge_older_than(now - timedelta(seconds=UNDO_TTL_SECONDS))
        db.commit()
        return tasks, undos
    except Exception:
        db.rollback()
        logger.exception("만료된 백그라운드 작업 정리 실패")
        return 0, 0
    finally:
        db.close()
