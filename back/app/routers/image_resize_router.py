"""이미지 리사이즈 라우터 — 얇은 HTTP 레이어."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.feature_flags import require_feature_flag
from app.core.security import get_current_user, get_db
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.schemas.image_resize_schema import ResizeInput, get_resize_input
from app.services.image_ai_edit_service import _UPSCALE_PROMPT
from app.services.image_resize_service import resize_image

router = APIRouter(
    prefix="/api/image-resize",
    tags=["image-resize"],
    dependencies=[Depends(require_feature_flag("is_image_resize_enabled"))],
)


@router.post("/resize")
async def resize_endpoint(
    inp: ResizeInput = Depends(get_resize_input),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    try:
        buf, download_name, media_type, ai_upscale_used, usage = resize_image(
            file_bytes=inp.file_bytes,
            original_filename=inp.filename,
            target_width=inp.width,
            target_height=inp.height,
            output_format=inp.output_format,
            use_ai_upscale=inp.use_ai_upscale,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"이미지 처리 중 오류: {exc}") from exc

    # 순수 리사이즈(Pillow)는 Gemini를 호출하지 않으므로 로그 대상에서 제외 — 실제 AI 호출이 있었을 때만 기록
    if ai_upscale_used:
        AIToolUsageLogRepository(db).create(
            user=current_user,
            tool="image_resize",
            image_filename=inp.filename,
            prompt=_UPSCALE_PROMPT,
            prompt_tokens=usage.prompt_tokens if usage else None,
            output_tokens=usage.output_tokens if usage else None,
            total_tokens=usage.total_tokens if usage else None,
        )

    encoded_name = quote(download_name, safe="")
    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "X-AI-Upscale-Used": "true" if ai_upscale_used else "false",
        },
    )
