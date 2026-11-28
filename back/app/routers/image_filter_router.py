"""AI 이미지 편집 라우터 — 얇은 HTTP 레이어."""

import base64
import io
import logging
from urllib.parse import quote

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.core.ai_budget import require_ai_budget
from app.core.feature_flags import require_feature_flag
from app.core.rate_limit import limiter
from app.core.security import get_current_user, get_db
from app.repositories.image_edit_record_repo import ImageEditRecordRepository
from app.services import storage_service
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
from app.services.image_filter_service import (
    EditPromptHistory,
    EditPromptRecord,
    EditResult,
    ImageEditError,
    edit_variants,
)

logger = logging.getLogger(__name__)

# 예산 게이트는 라우터 전체가 아니라 **AI 를 실제로 호출하는 엔드포인트에만** 건다.
# 전체에 걸면 월 예산을 넘긴 순간 과거 기록 조회(/history)와 스타일 목록까지 429 로
# 막힌다 — 돈이 드는 행동은 멈추되, 이미 한 일을 들여다보는 것까지 막을 이유는 없다.
router = APIRouter(
    prefix="/api/image-filter",
    tags=["image-filter"],
    dependencies=[Depends(require_feature_flag("is_image_filter_enabled"))],
)

_AI_BUDGET = Depends(require_ai_budget)


def _persist_edit_record(db: Session, user: User, inp: EditInput, result: EditResult) -> None:
    """편집 결과를 스토리지 + 기록 테이블에 남긴다 (②-B — 2026-11-28 사용자 결정).

    업로드 실패가 편집 응답을 막으면 안 된다 — 사용자는 이미 토큰을 썼고 결과를
    받을 권리가 있다. 실패분은 로그에 남기고 성공한 장수만 기록한다. 보관하는
    것은 **결과물뿐**이다: 업로드 원본은 지금처럼 메모리 처리 후 폐기한다
    (원본에는 인물·타사 저작물이 섞일 수 있어 보관 범위를 최소로 유지한다).

    경로는 기업·사용자 단위로 나눈다 — 11-26 의 "다른 기업 데이터가 섞여 보이는"
    사고를 이미지에서 반복하지 않기 위한 격리다.
    """
    if user.company_id is None:
        return  # 운영자(dev)는 기업 범위가 없다 — 보관 대상이 아니다

    paths: list[str] = []
    for variant in result.variants:
        try:
            ext = (variant.mime or "image/jpeg").rsplit("/", 1)[-1] or "jpg"
            path = f"image-edits/{user.company_id}/{user.id}/{uuid.uuid4().hex}.{ext}"
            storage_service.upload_bytes(
                path, base64.b64decode(variant.image_base64), content_type=variant.mime
            )
            paths.append(path)
        except Exception:
            logger.exception("편집 결과 업로드 실패 — 해당 시안만 기록에서 제외")

    try:
        ImageEditRecordRepository(db).create(
            user=user,
            company_id=user.company_id,
            image_filename=inp.filename,
            prompt=inp.prompt,
            image_paths=paths,
            variant_count=len(result.variants),
            mime=result.variants[0].mime if result.variants else "image/jpeg",
        )
    except Exception:
        logger.exception("편집 기록 저장 실패 — 응답은 정상 반환")


@router.post("/analyze", response_model=ElementAnalysis, dependencies=[_AI_BUDGET])
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


@router.get("/history", response_model=EditPromptHistory)
def edit_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EditPromptHistory:
    """로그인한 사용자의 편집 전송 기록(지시 + 결과 이미지 유무)을 최신순으로 돌려준다.

    조회는 기업 + 본인 두 조건으로 끊는다. 기업 범위만으로 끊으면 같은 회사
    동료의 작업물이 보이고, 기업 필터를 빠뜨리면 다른 고객사 기록까지 샌다.
    """
    if current_user.company_id is None:
        # 운영자(dev)는 소속 기업이 없다 — 기업 범위를 못 만드므로 빈 목록이 맞다
        return EditPromptHistory(items=[], total=0, retention_days=settings.IMAGE_EDIT_RETENTION_DAYS)

    repo = ImageEditRecordRepository(db)
    scope = {"company_id": current_user.company_id, "user_id": current_user.id}
    rows = repo.list_for_user(**scope, limit=limit, offset=offset)
    return EditPromptHistory(
        items=[EditPromptRecord.model_validate(row) for row in rows],
        total=repo.count_for_user(**scope),
        retention_days=settings.IMAGE_EDIT_RETENTION_DAYS,
    )


@router.get("/history/{record_id}/images/{index}")
def edit_history_image(
    record_id: int,
    index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """본인 소유 기록의 저장된 결과 이미지 한 장을 반환한다 (index 는 0부터)."""
    if current_user.company_id is None:
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")

    record = ImageEditRecordRepository(db).get_for_user(
        record_id, company_id=current_user.company_id, user_id=current_user.id
    )
    if record is None or not (0 <= index < len(record.image_paths)):
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")

    content = storage_service.download_bytes(record.image_paths[index])
    if content is None:
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")

    return Response(
        content=content,
        media_type=record.mime or "image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/history/{record_id}", status_code=204)
def delete_edit_history(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """본인 소유 기록 한 건을 삭제한다 — 보관의 전제인 '언제든 직접 삭제' 수단이다."""
    if current_user.company_id is None:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    repo = ImageEditRecordRepository(db)
    record = repo.get_for_user(
        record_id, company_id=current_user.company_id, user_id=current_user.id
    )
    if record is None:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    # 스토리지 객체도 함께 정리 (실패해도 레코드 삭제는 진행 — heading 삭제와 같은 판단)
    for path in record.image_paths:
        try:
            storage_service.delete_object(path)
        except Exception:
            logger.exception("기록 삭제 중 이미지 객체 삭제 실패 (path=%s)", path)

    repo.delete(record)
    return Response(status_code=204)


@router.get("/background-styles", response_model=list[BackgroundStyle])
def background_styles_endpoint() -> list[BackgroundStyle]:
    """고를 수 있는 배경 스타일 목록 — 프런트가 선택 UI를 그릴 때 쓴다."""
    return available_styles()


@router.post("/backgrounds", response_model=BackgroundSuggestion, dependencies=[_AI_BUDGET])
@limiter.limit(settings.RATE_LIMIT_AI)
async def backgrounds_endpoint(
    request: Request,
    file: UploadFile = File(..., description="배경 시안을 만들 이미지"),
    styles: str = Form("", description="생성할 스타일 키 (쉼표 구분, 비우면 전체)"),
    custom: str = Form("", description="직접 입력한 배경 묘사 (줄바꿈 구분)"),
    current_user: User = Depends(get_current_user),
) -> BackgroundSuggestion:
    """피사체는 유지하고 배경만 바꾼 시안을 고른 스타일 수만큼 생성해 돌려준다.

    직접 입력한 배경은 줄바꿈으로 나눈다 — 쉼표로 나누는 프리셋 키와 달리 사람이
    쓴 문장에는 쉼표가 들어갈 수 있어서("흰 배경, 부드러운 그림자") 같은 구분자를
    쓰면 한 건이 두 건으로 쪼개진다.
    """
    validate_content_length(request)
    file_bytes, filename = await read_and_check_file(file)

    try:
        suggestion, usage = await suggest_backgrounds(
            file_bytes,
            styles=[s for s in styles.split(",") if s.strip()],
            customs=[line for line in custom.splitlines() if line.strip()],
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


# response_model 을 명시하는 이유 — 반환 타입이 유니온(JSON | 바이너리)이라
# FastAPI 가 애너테이션만으로는 응답 모델을 만들지 못한다. 명시해 두면 OpenAPI 에
# EditResult 스키마가 그대로 남아 프런트 타입 생성이 끊기지 않는다.
@router.post("/edit", response_model=EditResult, dependencies=[_AI_BUDGET])
@limiter.limit(settings.RATE_LIMIT_AI)
async def edit_endpoint(
    request: Request,
    inp: EditInput = Depends(get_edit_input),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """같은 지시로 시안 `count` 장을 만들어 돌려준다 (기본 4장, 상한 6장).

    응답이 단일 바이너리에서 JSON(base64) 로 바뀐 이유는 단순하다 — 한 번에 여러
    장을 담아야 한다. 전송량이 늘어나는 단점은 배경 시안도 같이 안고 있고, 백로그의
    "base64 → 바이너리 전송" 항목에서 두 경로를 함께 고치는 쪽이 맞다.

    **`count` 를 보내지 않으면 옛 응답(이미지 1장 바이너리)으로 답한다.** 프런트와
    백엔드는 따로 배포되고, 이미 열려 있는 탭은 옛 JS 를 그대로 쥐고 있다. 그 구간에
    JSON 을 돌려주면 옛 클라이언트가 `res.blob()` 로 받아 **JSON 을 이미지라고 믿는
    깨진 버전**을 만든다 — 오류도 안 난다. 2026-11-26에 겪은 "DB 먼저, 코드 나중"
    배포 공백과 같은 종류라, 이번에는 서버가 양쪽을 다 받는다.
    프런트 배포가 끝나 옛 클라이언트가 사라지면 이 분기를 지운다.
    """
    legacy_single = inp.count is None

    try:
        # Gemini 이미지 생성(수십 초) + PIL 리사이즈가 모두 동기라, 이벤트 루프에서
        # 직접 호출하면 그동안 서버 전체가 멈춘다. edit_variants 가 장수만큼
        # asyncio.to_thread 로 병렬 호출한다 — 4장이어도 체감은 1장과 비슷하다.
        result, usage = await edit_variants(
            file_bytes=inp.file_bytes,
            original_filename=inp.filename,
            prompt=inp.prompt,
            target_width=inp.width,
            target_height=inp.height,
            output_format=inp.output_format,
            count=1 if legacy_single else inp.count,
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

    # 결과 보관(스토리지 업로드 + 기록 행) — 실패해도 응답은 그대로 나간다.
    # 업로드는 네트워크 I/O 라 이벤트 루프 밖에서 처리한다.
    await run_in_threadpool(_persist_edit_record, db, current_user, inp, result)

    # 사용량 기록도 커밋을 동반하는 DB 쓰기라 이벤트 루프 밖에서 처리한다.
    # 장수를 프롬프트 로그에 남긴다 — 사용량 로그만 보고도 "왜 이 건이 4배인지"가
    # 설명돼야 월간 예산을 추적할 수 있다.
    await run_in_threadpool(
        log_ai_usage,
        user=current_user,
        tool="image_filter",
        label=inp.filename,
        prompt=(
            inp.prompt
            if legacy_single
            else f"[시안 {len(result.variants)}/{inp.count}장] {inp.prompt}"
        ),
        usage=usage,
    )

    if legacy_single:
        # 옛 클라이언트가 기대하는 그대로 — 이미지 1장 + 파일명 헤더 + 제공사 헤더
        only = result.variants[0]
        encoded_name = quote(only.filename, safe="")
        return StreamingResponse(
            io.BytesIO(base64.b64decode(only.image_base64)),
            media_type=only.mime,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
                "X-AI-Provider":       result.provider,
            },
        )

    return result
