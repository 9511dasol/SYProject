"""AI 이미지 편집 라우터 — 얇은 HTTP 레이어."""

import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.core.ai_budget import require_ai_budget
from app.core.feature_flags import require_feature_flag
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.core.settings import settings
from app.models.user_model import User
from app.schemas.image_filter_schema import EditInput, get_edit_input
from app.schemas.image_resize_schema import read_and_check_file, validate_content_length
from app.services.ai_usage import log_ai_usage
from app.services.image_background_service import (
    BackgroundStyle,
    BackgroundSuggestion,
    ImageBackgroundError,
    available_styles,
    suggest_backgrounds,
)
from app.services.image_element_service import (
    ElementAnalysis,
    ImageAnalyzeError,
    analyze_elements,
)
from app.services.image_filter_service import ImageEditError, edit_and_resize

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/image-filter",
    tags=["image-filter"],
    dependencies=[
        Depends(require_feature_flag("is_image_filter_enabled")),
        Depends(require_ai_budget),
    ],
)


@router.post("/analyze", response_model=ElementAnalysis)
@limiter.limit(settings.RATE_LIMIT_AI)
async def analyze_endpoint(
    request: Request,
    file: UploadFile = File(..., description="분석할 이미지"),
    current_user: User = Depends(get_current_user),
) -> ElementAnalysis:
    """이미지 속 구성 요소(텍스트·로고·제품 등)를 bounding box 와 함께 추출.

    프런트가 박스를 이미지 위에 겹쳐 그려 "클릭으로 수정 대상 특정"에 쓴다.
    """
    validate_content_length(request)
    file_bytes, filename = await read_and_check_file(file)

    try:
        analysis, usage = await analyze_elements(file_bytes)
    except ImageAnalyzeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    await run_in_threadpool(
        log_ai_usage,
        user=current_user,
        tool="image_element_analyze",
        label=filename,
        prompt=f"요소 분석 ({len(analysis.elements)}개 검출)",
        usage=usage,
    )
    return analysis


@router.get("/background-styles", response_model=list[BackgroundStyle])
def background_styles_endpoint() -> list[BackgroundStyle]:
    """고를 수 있는 배경 스타일 목록 — 프런트가 선택 UI를 그릴 때 쓴다."""
    return available_styles()


@router.post("/backgrounds", response_model=BackgroundSuggestion)
@limiter.limit(settings.RATE_LIMIT_AI)
async def backgrounds_endpoint(
    request: Request,
    file: UploadFile = File(..., description="배경 시안을 만들 이미지"),
    styles: str = Form("", description="생성할 스타일 키 (쉼표 구분, 비우면 전체)"),
    current_user: User = Depends(get_current_user),
) -> BackgroundSuggestion:
    """피사체는 유지하고 배경만 바꾼 시안을 고른 스타일 수만큼 생성해 돌려준다."""
    validate_content_length(request)
    file_bytes, filename = await read_and_check_file(file)

    try:
        suggestion, usage = await suggest_backgrounds(
            file_bytes,
            styles=[s for s in styles.split(",") if s.strip()],
        )
    except ImageBackgroundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    await run_in_threadpool(
        log_ai_usage,
        user=current_user,
        tool="image_background",
        label=filename,
        prompt=f"배경 시안 생성 ({len(suggestion.variants)}종)",
        usage=usage,
    )
    return suggestion


@router.post("/edit")
@limiter.limit(settings.RATE_LIMIT_AI)
async def edit_endpoint(
    request: Request,
    inp: EditInput = Depends(get_edit_input),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    try:
        # Gemini 이미지 생성(수십 초) + PIL 리사이즈가 모두 동기라, 이벤트 루프에서
        # 직접 호출하면 그동안 서버 전체가 멈춘다. 같은 라우터의 backgrounds 경로와
        # 동일하게 스레드풀로 넘긴다.
        buf, download_name, content_type, ai_provider, usage = await run_in_threadpool(
            edit_and_resize,
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
        # 내부 예외 문자열을 그대로 내보내지 않는다 — 원인은 서버 로그에만 남긴다.
        logger.exception("이미지 편집 실패 (filename=%s)", inp.filename)
        raise HTTPException(
            status_code=422,
            detail="이미지 처리 중 오류가 발생했습니다. 이미지 파일을 확인한 뒤 다시 시도해 주세요.",
        ) from exc

    # 사용량 기록도 커밋을 동반하는 DB 쓰기라 이벤트 루프 밖에서 처리한다.
    await run_in_threadpool(
        log_ai_usage,
        user=current_user,
        tool="image_filter",
        label=inp.filename,
        prompt=inp.prompt,
        usage=usage,
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
