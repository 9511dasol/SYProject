"""이미지 정제(AI 필터) 라우터 — 얇은 HTTP 레이어."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from app.schemas.image_filter_schema import (
    AnalyzeInput,
    FilterRejectResponse,
    get_analyze_input,
)
from app.services.image_filter_service import FilterRejectError, analyze_and_resize

router = APIRouter(prefix="/api/image-filter", tags=["image-filter"])


@router.post("/analyze-and-resize")
async def analyze_and_resize_endpoint(
    inp: AnalyzeInput = Depends(get_analyze_input),
) -> StreamingResponse:
    try:
        buf, download_name, content_type, ai_reason, ai_provider = await analyze_and_resize(
            file_bytes=inp.file_bytes,
            original_filename=inp.filename,
            condition=inp.condition,
            target_width=inp.width,
            target_height=inp.height,
            output_format=inp.output_format,
        )

    except FilterRejectError as exc:
        body = FilterRejectResponse(
            reason=exc.reason,
            provider=exc.provider,
            suggestions=exc.suggestions,
        )
        return JSONResponse(
            status_code=400,
            content=body.model_dump(by_alias=True),
        )

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"이미지 처리 중 오류: {exc}") from exc

    encoded_name = quote(download_name, safe="")
    return StreamingResponse(
        buf,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "X-AI-Reason":         ai_reason,
            "X-AI-Provider":       ai_provider,
        },
    )
