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
from app.services.image_filter_service import MAX_EDIT_VARIANTS

# ── 검증된 입력 컨테이너 ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class EditInput:
    file_bytes:    bytes
    filename:      str
    prompt:        str
    width:         int | None
    height:        int | None
    output_format: str
    #: None = count 를 보내지 않은 구버전 클라이언트. 라우터가 옛 응답 형태로 답한다.
    count:         int | None


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
    # 상한을 서버에서도 막는 이유 — 화면에서만 막으면 요청을 직접 만들어 보내는
    # 경로로 이미지 생성 호출(=과금)을 무한정 늘릴 수 있다. 배경 시안 쪽과 같은 판단.
    count:   int | None   = Form(
        None,
        ge=1,
        le=MAX_EDIT_VARIANTS,
        description=(
            f"생성할 시안 수 (1~{MAX_EDIT_VARIANTS}). 한 장이 이미지 생성 1회다. "
            "생략하면 구버전 클라이언트로 보고 이미지 1장을 바이너리로 돌려준다"
        ),
    ),
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
        count=count,
    )
