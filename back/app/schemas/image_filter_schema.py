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
    # 사용자가 한 칸에 쓰는 글은 500자(프런트 maxLength)지만, 프런트는 요소마다
    # 써 둔 지시를 좌표 설명과 함께 한 번에 묶어 보낸다 — 요소 수만큼 늘어나므로
    # 그 합을 수용할 만큼 열어 둔다(텍스트 토큰 비용은 이미지 생성에 비해 미미하다).
    prompt:  str          = Form(..., min_length=1, max_length=4000, description="AI 편집 프롬프트"),
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
