"""헤딩 문구 추천 라우터 — 얇은 HTTP 레이어."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.feature_flags import require_feature_flag
from app.core.security import get_current_user, get_db
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.schemas.heading_schema import HeadingInput, HeadingResponse, get_heading_input
from app.services.heading_service import generate_headings

router = APIRouter(
    prefix="/api/heading",
    tags=["heading"],
    dependencies=[Depends(require_feature_flag("is_heading_suggest_enabled"))],
)


@router.post("/suggest", response_model=HeadingResponse)
async def suggest_headings(
    inp: HeadingInput = Depends(get_heading_input),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        result, usage = await generate_headings(inp.file_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"헤딩 생성 중 오류: {exc}") from exc

    AIToolUsageLogRepository(db).create(
        user=current_user,
        tool="heading_suggest",
        image_filename=inp.filename,
        prompt_tokens=usage.prompt_tokens if usage else None,
        output_tokens=usage.output_tokens if usage else None,
        total_tokens=usage.total_tokens if usage else None,
    )

    return JSONResponse(content=result.model_dump())
