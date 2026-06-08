"""태스크 상태 조회 라우터.

프론트엔드 TaskNotificationWidget이 3초마다 이 엔드포인트를 폴링합니다.

---- 다른 서비스에서 태스크 연동 예시 ----

from app.services.task_service import create_task, update_task

async def process_image_with_ai(file_bytes: bytes) -> str:
    task_id = create_task(total_steps=3)
    # 즉시 task_id를 클라이언트에 반환 (프론트엔드가 쿠키에 저장)

    # 백그라운드 작업 (asyncio.create_task 또는 BackgroundTasks 활용)
    update_task(task_id, status="processing", progress=20,
                message="[1/3] 이미지 분석 중...", step=1)
    ...
    update_task(task_id, status="processing", progress=60,
                message="[2/3] AI 카피라이팅 생성 중...", step=2)
    ...
    update_task(task_id, status="completed", progress=100,
                message="[3/3] 완료!", step=3)

    return task_id
"""

from fastapi import APIRouter, HTTPException

from app.schemas.task_schema import TaskStatusResponse
from app.services.task_service import get_task

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status(task_id: str) -> TaskStatusResponse:
    task = get_task(task_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"태스크를 찾을 수 없습니다: {task_id}",
        )
    return task
