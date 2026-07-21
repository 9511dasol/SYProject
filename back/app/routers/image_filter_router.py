"""AI 이미지 편집 라우터 — 얇은 HTTP 레이어."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.feature_flags import require_feature_flag
from app.schemas.image_filter_schema import EditInput, get_edit_input
from app.services.image_filter_service import ImageEditError, edit_and_resize

router = APIRouter(
    prefix="/api/image-filter",
    tags=["image-filter"],
    dependencies=[Depends(require_feature_flag("is_image_filter_enabled"))],
)


@router.post("/edit")
async def edit_endpoint(
    inp: EditInput = Depends(get_edit_input),
) -> StreamingResponse:
    try:
        buf, download_name, content_type, ai_provider = edit_and_resize(
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

    encoded_name = quote(download_name, safe="")
    return StreamingResponse(
        buf,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "X-AI-Provider":       ai_provider,
        },
    )
