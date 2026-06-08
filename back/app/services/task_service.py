"""백그라운드 태스크 상태를 관리하는 인메모리 스토어.

실제 프로덕션에서는 Redis 등 외부 스토어로 교체하세요.
각 기능 서비스(image_filter_service 등)에서 create_task()로 task_id를 생성하고,
처리 단계마다 update_task()로 진행 상황을 갱신합니다.
"""

import uuid
from typing import Literal

from app.schemas.task_schema import TaskStatusResponse

_store: dict[str, TaskStatusResponse] = {}


def create_task(total_steps: int = 3) -> str:
    """새 태스크를 생성하고 task_id를 반환합니다."""
    task_id = str(uuid.uuid4())
    _store[task_id] = TaskStatusResponse(
        task_id=task_id,
        status="processing",
        progress=0,
        message="작업을 준비하는 중...",
        step=0,
        total_steps=total_steps,
    )
    return task_id


def get_task(task_id: str) -> TaskStatusResponse | None:
    return _store.get(task_id)


def update_task(
    task_id: str,
    *,
    status: Literal["processing", "completed", "failed"],
    progress: int,
    message: str,
    step: int | None = None,
    total_steps: int | None = None,
) -> None:
    existing = _store.get(task_id)
    if existing is None:
        return
    _store[task_id] = TaskStatusResponse(
        task_id=task_id,
        status=status,
        progress=progress,
        message=message,
        step=step if step is not None else existing.step,
        total_steps=total_steps if total_steps is not None else existing.total_steps,
    )


def delete_task(task_id: str) -> None:
    _store.pop(task_id, None)
