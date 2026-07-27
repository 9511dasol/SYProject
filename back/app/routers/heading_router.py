"""헤딩 문구 추천 라우터 — 얇은 HTTP 레이어."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.feature_flags import require_feature_flag
from app.core.security import get_current_user, get_db
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.repositories.heading_suggestion_repo import HeadingSuggestionRepository
from app.schemas.heading_schema import (
    HeadingHistoryResponse,
    HeadingInput,
    HeadingSuggestionRecord,
    get_heading_input,
)
from app.services import storage_service
from app.services.heading_service import generate_headings

logger = logging.getLogger(__name__)


def _upload_thumbnail(user_id: int, thumbnail_bytes: bytes) -> str | None:
    """썸네일을 Supabase Storage에 올리고 object path를 반환한다.

    스토리지 업로드가 실패해도 문구 생성/저장 자체는 성공시켜야 하므로
    실패 시 None을 반환하고 로그만 남긴다 (이미지 없이 텍스트만 저장됨).
    """
    path = f"headings/{user_id}/{uuid.uuid4().hex}.jpg"
    try:
        return storage_service.upload_bytes(path, thumbnail_bytes, content_type="image/jpeg")
    except Exception:
        logger.exception("헤딩 썸네일 업로드 실패 — 이미지 없이 저장")
        return None

router = APIRouter(
    prefix="/api/heading",
    tags=["heading"],
    dependencies=[Depends(require_feature_flag("is_heading_suggest_enabled"))],
)


@router.post("/suggest", response_model=HeadingSuggestionRecord)
async def suggest_headings(
    inp: HeadingInput = Depends(get_heading_input),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HeadingSuggestionRecord:
    try:
        result, usage, thumbnail_bytes = await generate_headings(inp.file_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"헤딩 생성 중 오류: {exc}") from exc

    # 썸네일을 Storage에 저장하고, 생성 결과를 사용자별 히스토리로 저장 (페이지 재접속 시 복원용)
    image_path = _upload_thumbnail(current_user.id, thumbnail_bytes)
    record = HeadingSuggestionRepository(db).create(
        user=current_user,
        image_filename=inp.filename,
        image_path=image_path,
        headings=[h.model_dump() for h in result.headings],
    )

    AIToolUsageLogRepository(db).create(
        user=current_user,
        tool="heading_suggest",
        image_filename=inp.filename,
        prompt_tokens=usage.prompt_tokens if usage else None,
        output_tokens=usage.output_tokens if usage else None,
        total_tokens=usage.total_tokens if usage else None,
    )

    return HeadingSuggestionRecord.model_validate(record)


@router.get("/history", response_model=HeadingHistoryResponse)
def heading_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HeadingHistoryResponse:
    """로그인한 사용자가 과거에 생성한 문구 기록을 최신순으로 반환한다."""
    records = HeadingSuggestionRepository(db).list_for_user(current_user.id, limit=limit)
    return HeadingHistoryResponse(
        items=[HeadingSuggestionRecord.model_validate(r) for r in records]
    )


@router.get("/history/{suggestion_id}/image")
def heading_history_image(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """본인 소유 기록의 저장된 썸네일 이미지를 반환한다."""
    record = HeadingSuggestionRepository(db).get(suggestion_id)
    if record is None or record.user_id != current_user.id or not record.image_path:
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")

    content = storage_service.download_bytes(record.image_path)
    if content is None:
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")

    return Response(
        content=content,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/history/{suggestion_id}", status_code=204)
def delete_heading_history(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """본인 소유의 문구 기록 한 건을 삭제한다."""
    repo = HeadingSuggestionRepository(db)
    record = repo.get(suggestion_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    # 저장된 썸네일도 함께 정리 (실패해도 DB 레코드 삭제는 진행)
    if record.image_path:
        try:
            storage_service.delete_object(record.image_path)
        except Exception:
            logger.exception("헤딩 썸네일 삭제 실패 (레코드는 삭제 진행)")

    repo.delete(record)
    return Response(status_code=204)
