"""헤딩 문구 추천 라우터 — 얇은 HTTP 레이어."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.schemas.heading_schema import HeadingInput, HeadingResponse, get_heading_input
from app.services.heading_service import generate_headings

router = APIRouter(prefix="/api/heading", tags=["heading"])


@router.post("/suggest", response_model=HeadingResponse)
async def suggest_headings(
    inp: HeadingInput = Depends(get_heading_input),
) -> JSONResponse:
    try:
        result = await generate_headings(inp.file_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"헤딩 생성 중 오류: {exc}") from exc

    return JSONResponse(content=result.model_dump())
