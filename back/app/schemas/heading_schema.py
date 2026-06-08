"""헤딩 문구 추천 — 요청 스키마, 검증 Dependency, 응답 모델."""

from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.schemas.image_resize_schema import (
    MAX_UPLOAD_BYTES,
    ALLOWED_MIME,
    validate_content_length,
    read_and_check_file,
)

# ── 지원 플랫폼 ───────────────────────────────────────────────────────────────

Platform = Literal["Instagram", "Blog", "YouTube"]

# ── 검증된 입력 컨테이너 ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class HeadingInput:
    file_bytes: bytes
    filename:   str


# ── 응답 모델 ──────────────────────────────────────────────────────────────────

class HeadingItem(BaseModel):
    id:       int
    platform: Platform
    text:     str = Field(..., min_length=1, max_length=200)
    desc:     str = Field(..., min_length=1, max_length=500)


class HeadingResponse(BaseModel):
    headings: Annotated[list[HeadingItem], Field(min_length=1, max_length=10)]


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_heading_input(
    request: Request,
    file:    UploadFile = File(..., description="분석할 마케팅 이미지"),
) -> HeadingInput:
    """이미지 업로드 검증 후 HeadingInput 반환."""
    validate_content_length(request)
    file_bytes, filename = await read_and_check_file(file)
    return HeadingInput(file_bytes=file_bytes, filename=filename)
