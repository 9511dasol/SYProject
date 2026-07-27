"""헤딩 문구 추천 — 요청 스키마, 검증 Dependency, 응답 모델."""

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Literal

from fastapi import File, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.image_resize_schema import (
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


# ── 저장된 생성 기록 (사용자별 히스토리) ──────────────────────────────────────

class HeadingSuggestionRecord(BaseModel):
    """DB에 저장된 한 번의 문구 생성 결과."""

    model_config = ConfigDict(from_attributes=True)

    id:             int
    image_filename: str
    has_image:      bool
    created_at:     datetime
    headings:       list[HeadingItem]


class HeadingHistoryResponse(BaseModel):
    items: list[HeadingSuggestionRecord]


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_heading_input(
    request: Request,
    file:    UploadFile = File(..., description="분석할 마케팅 이미지"),
) -> HeadingInput:
    """이미지 업로드 검증 후 HeadingInput 반환."""
    validate_content_length(request)
    file_bytes, filename = await read_and_check_file(file)
    return HeadingInput(file_bytes=file_bytes, filename=filename)
