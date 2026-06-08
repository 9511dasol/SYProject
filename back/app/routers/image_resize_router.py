"""이미지 리사이즈 라우터 — 얇은 HTTP 레이어."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.image_resize_schema import ResizeInput, get_resize_input
from app.services.image_resize_service import resize_image

router = APIRouter(prefix="/api/image-resize", tags=["image-resize"])


@router.post("/resize")
async def resize_endpoint(
    inp: ResizeInput = Depends(get_resize_input),
) -> StreamingResponse:
    try:
        buf, download_name, media_type = resize_image(
            file_bytes=inp.file_bytes,
            original_filename=inp.filename,
            target_width=inp.width,
            target_height=inp.height,
            output_format=inp.output_format,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"이미지 처리 중 오류: {exc}") from exc

    encoded_name = quote(download_name, safe="")
    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )
