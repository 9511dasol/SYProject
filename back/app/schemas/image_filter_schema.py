"""이미지 정제(AI 필터) — 요청 스키마 및 검증 Dependency.

공통 업로드 검증 로직은 image_resize_schema 에서 재사용합니다.
"""

from dataclasses import dataclass

from fastapi import File, Form, Request, UploadFile
from pydantic import BaseModel, Field

from app.schemas.image_resize_schema import (
    normalize_format,
    read_and_check_file,
    validate_content_length,
)

# ── 검증된 입력 컨테이너 ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class AnalyzeInput:
    file_bytes:    bytes
    filename:      str
    condition:     str
    width:         int | None
    height:        int | None
    output_format: str


# ── 응답 모델 ──────────────────────────────────────────────────────────────────

class FilterRejectResponse(BaseModel):
    """AI 조건 불일치 시 400 응답 바디."""
    passed:      bool       = Field(False, alias="pass")
    reason:      str
    provider:    str
    suggestions: list[str]  = Field(default_factory=list)
    detail:      str        = "조건에 맞지 않는 이미지입니다."

    model_config = {"populate_by_name": True}


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_analyze_input(
    request:   Request,
    file:      UploadFile  = File(..., description="정제·리사이즈할 이미지"),
    condition: str         = Form(..., min_length=1, max_length=500, description="AI 정제 조건"),
    width:     int | None  = Form(None, ge=1, le=99_999, description="목표 가로 (px)"),
    height:    int | None  = Form(None, ge=1, le=99_999, description="목표 세로 (px)"),
    format:    str         = Form("jpeg", description="출력 포맷: jpeg | png | webp"),
) -> AnalyzeInput:
    """이미지 + 정제 조건 전체 검증 후 AnalyzeInput 반환."""
    validate_content_length(request)
    fmt = normalize_format(format)
    file_bytes, filename = await read_and_check_file(file)
    return AnalyzeInput(
        file_bytes=file_bytes,
        filename=filename,
        condition=condition.strip(),
        width=width,
        height=height,
        output_format=fmt,
    )
