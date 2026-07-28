"""단계별 진행률이 있는 범용 백그라운드 태스크 헬퍼.

상태는 app.services.task_store를 통해 DB(background_tasks)에 저장되므로
인스턴스가 여러 개거나 재시작돼도 진행률 폴링이 끊기지 않는다.

각 기능 서비스(image_filter_service 등)에서 create_task()로 task_id를 생성하고,
처리 단계마다 update_task()로 진행 상황을 갱신합니다.
"""

from typing import Literal

from app.schemas.task_schema import TaskStatusResponse
from app.services import task_store

_KIND = "generic"


def _to_response(task: dict) -> TaskStatusResponse:
    result = task.get("result") or {}
    return TaskStatusResponse(
        task_id=task["id"],
        status=task["status"],  # type: ignore[arg-type]
        progress=task["progress"],
        message=task["message"],
        step=result.get("step"),
        total_steps=result.get("total_steps"),
    )


def create_task(total_steps: int = 3) -> str:
    """새 태스크를 생성하고 task_id를 반환합니다."""
    return task_store.create_task(
        _KIND,
        status="processing",
        progress=0,
        message="작업을 준비하는 중...",
        result={"step": 0, "total_steps": total_steps},
    )


def get_task(task_id: str) -> TaskStatusResponse | None:
    task = task_store.get_task(task_id, kind=_KIND)
    return _to_response(task) if task else None


def update_task(
    task_id: str,
    *,
    status: Literal["processing", "completed", "failed"],
    progress: int,
    message: str,
    step: int | None = None,
    total_steps: int | None = None,
) -> None:
    patch: dict = {}
    if step is not None:
        patch["step"] = step
    if total_steps is not None:
        patch["total_steps"] = total_steps

    task_store.update_task(
        task_id,
        status=status,
        progress=progress,
        message=message,
        result_patch=patch or None,
    )


def delete_task(task_id: str) -> None:
    task_store.delete_task(task_id)
