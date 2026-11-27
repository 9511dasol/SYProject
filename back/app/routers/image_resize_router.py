"""이미지 리사이즈 라우터 — 얇은 HTTP 레이어."""

import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.ai_budget import check_ai_budget
from app.core.feature_flags import require_feature_flag
from app.core.security import get_current_user, get_db
from app.core.tenant import TenantContext, get_tenant_context
from app.models.user_model import User
from app.schemas.image_resize_schema import (
    ResizeInput,
    get_resize_input,
    normalize_format,
    read_and_check_file,
    validate_content_length,
)
from app.services.ai_usage import log_ai_usage
from app.services.image_ai_edit_service import _UPSCALE_PROMPT
from app.services.image_resize_service import resize_image
from app.services.media_preset_service import (
    MEDIA_PRESETS,
    MediaPreset,
    UnknownPresetError,
    batch_resize_zip,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/image-resize",
    tags=["image-resize"],
    dependencies=[Depends(require_feature_flag("is_image_resize_enabled"))],
)


@router.get("/presets", response_model=list[MediaPreset])
async def presets_endpoint() -> list[MediaPreset]:
    """매체 규격 프리셋 목록 — 프런트 체크박스의 단일 출처."""
    return MEDIA_PRESETS


@router.post("/batch")
async def batch_endpoint(
    request: Request,
    file: UploadFile = File(..., description="변환할 이미지"),
    presets: str = Form(..., description="프리셋 키 목록 (쉼표 구분)"),
    format: str = Form("jpeg", description="출력 포맷: jpeg | png | webp"),
    _: User = Depends(get_current_user),
) -> StreamingResponse:
    """선택한 매체 규격들로 비율 유지(중앙 크롭) 변환해 zip 으로 내려준다. AI 미사용."""
    validate_content_length(request)
    fmt = normalize_format(format)
    file_bytes, filename = await read_and_check_file(file)

    keys = [k.strip() for k in presets.split(",") if k.strip()]
    if not keys:
        raise HTTPException(status_code=422, detail="변환할 규격을 하나 이상 선택해 주세요.")

    try:
        # 프리셋 수만큼의 PIL 변환 + zip 압축이라 길게는 초 단위로 블로킹된다.
        buf, download_name, content_type = await run_in_threadpool(
            batch_resize_zip, file_bytes, filename, keys, fmt
        )
    except UnknownPresetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        # 내부 예외 문자열을 그대로 내보내지 않는다 — 원인은 서버 로그에만 남긴다.
        logger.exception("매체 규격 일괄 변환 실패 (filename=%s)", filename)
        raise HTTPException(
            status_code=422,
            detail="이미지 처리 중 오류가 발생했습니다. 이미지 파일을 확인한 뒤 다시 시도해 주세요.",
        ) from exc

    encoded_name = quote(download_name, safe="")
    return StreamingResponse(
        buf,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.post("/resize")
async def resize_endpoint(
    inp: ResizeInput = Depends(get_resize_input),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
) -> StreamingResponse:
    # 순수 Pillow 리사이즈는 과금이 없으므로, AI 업스케일을 요청한 경우에만 예산을 확인한다.
    # 예산·사용량은 모두 기업 범위다 — 멀티테넌시 전환 때 이 호출부만 company_id 를
    # 넘기지 않아, 업스케일 요청이 예산 검사 대신 TypeError(500)로 죽고 있었다.
    if inp.use_ai_upscale:
        check_ai_budget(db, ctx.company_id)

    try:
        # PIL 리샘플링은 CPU 바운드이고, AI 업스케일을 켜면 동기 Gemini 호출까지 붙는다.
        buf, download_name, media_type, ai_upscale_used, usage = await run_in_threadpool(
            resize_image,
            file_bytes=inp.file_bytes,
            original_filename=inp.filename,
            target_width=inp.width,
            target_height=inp.height,
            output_format=inp.output_format,
            use_ai_upscale=inp.use_ai_upscale,
        )
    except Exception as exc:
        # 내부 예외 문자열을 그대로 내보내지 않는다 — 원인은 서버 로그에만 남긴다.
        logger.exception("이미지 리사이즈 실패 (filename=%s)", inp.filename)
        raise HTTPException(
            status_code=422,
            detail="이미지 처리 중 오류가 발생했습니다. 이미지 파일을 확인한 뒤 다시 시도해 주세요.",
        ) from exc

    # 순수 리사이즈(Pillow)는 Gemini를 호출하지 않으므로 로그 대상에서 제외 — 실제 AI 호출이 있었을 때만 기록
    if ai_upscale_used:
        # 사용량 기록도 커밋을 동반하는 DB 쓰기라 이벤트 루프 밖에서 처리한다.
        await run_in_threadpool(
            log_ai_usage,
            user=ctx.user,
            company_id=ctx.company_id,
            tool="image_resize",
            label=inp.filename,
            prompt=_UPSCALE_PROMPT,
            usage=usage,
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
