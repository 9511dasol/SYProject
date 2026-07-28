"""AI 이미지 편집 라우터 — 얇은 HTTP 레이어."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.ai_budget import require_ai_budget
from app.core.feature_flags import require_feature_flag
from app.core.rate_limit import limiter
from app.core.security import get_current_user, get_db
from app.core.settings import settings
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.schemas.image_filter_schema import EditInput, get_edit_input
from app.services.image_filter_service import ImageEditError, edit_and_resize

router = APIRouter(
    prefix="/api/image-filter",
    tags=["image-filter"],
    dependencies=[
        Depends(require_feature_flag("is_image_filter_enabled")),
        Depends(require_ai_budget),
    ],
)


@router.post("/edit")
@limiter.limit(settings.RATE_LIMIT_AI)
async def edit_endpoint(
    request: Request,
    inp: EditInput = Depends(get_edit_input),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    try:
        buf, download_name, content_type, ai_provider, usage = edit_and_resize(
            file_bytes=inp.file_bytes,
            original_filename=inp.filename,
            prompt=inp.prompt,
            target_width=inp.width,
            target_height=inp.height,
            output_format=inp.output_format,
        )

    except ImageEditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"이미지 처리 중 오류: {exc}") from exc

    AIToolUsageLogRepository(db).create(
        user=current_user,
        tool="image_filter",
        image_filename=inp.filename,
        prompt=inp.prompt,
        prompt_tokens=usage.prompt_tokens if usage else None,
        output_tokens=usage.output_tokens if usage else None,
        total_tokens=usage.total_tokens if usage else None,
    )

    encoded_name = quote(download_name, safe="")
    return StreamingResponse(
        buf,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "X-AI-Provider":       ai_provider,
        },
    )
