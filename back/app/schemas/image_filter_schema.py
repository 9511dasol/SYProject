"""AI 이미지 편집 — 요청 스키마 및 검증 Dependency.

공통 업로드 검증 로직은 image_resize_schema 에서 재사용합니다.
"""

from dataclasses import dataclass

from fastapi import File, Form, Request, UploadFile

from app.schemas.image_resize_schema import (
    normalize_format,
    read_and_check_file,
    validate_content_length,
)

# ── 검증된 입력 컨테이너 ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class EditInput:
    file_bytes:    bytes
    filename:      str
    prompt:        str
    width:         int | None
    height:        int | None
    output_format: str


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_edit_input(
    request: Request,
    file:    UploadFile   = File(..., description="편집할 이미지"),
    prompt:  str          = Form(..., min_length=1, max_length=500, description="AI 편집 프롬프트"),
    width:   int | None   = Form(None, ge=1, le=99_999, description="목표 가로 (px)"),
    height:  int | None   = Form(None, ge=1, le=99_999, description="목표 세로 (px)"),
    format:  str          = Form("jpeg", description="출력 포맷: jpeg | png | webp"),
) -> EditInput:
    """이미지 + 편집 프롬프트 전체 검증 후 EditInput 반환."""
    validate_content_length(request)
    fmt = normalize_format(format)
    file_bytes, filename = await read_and_check_file(file)
    return EditInput(
        file_bytes=file_bytes,
        filename=filename,
        prompt=prompt.strip(),
        width=width,
        height=height,
        output_format=fmt,
    )
