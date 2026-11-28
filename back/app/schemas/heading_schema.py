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
    """문구 한 건 — 타이틀(text)과 그 타이틀에 딸린 본문 카피(body).

    `desc` 는 2026-11-27 이전에 생성된 기록에만 들어 있는 옛 필드다. 당시 두 번째
    필드는 본문이 아니라 "이 문구를 추천하는 이유"였다. 같은 필드에 다른 의미를
    덮어쓰지 않고 `body` 를 새로 둔 이유가 여기 있다 — 덮어썼다면 이력 화면이
    과거 기록의 추천 이유를 본문 카피라고 표시하게 된다.

    그래서 둘 다 선택 필드다. 새 생성물은 body 만, 옛 기록은 desc 만 갖는다
    (생성 경로에서 body 누락은 heading_service._parse_response 가 걸러 재시도한다).
    """

    id:       int
    platform: Platform
    text:     str = Field(..., min_length=1, max_length=200)
    body:     str | None = Field(default=None, max_length=1000)
    desc:     str | None = Field(default=None, max_length=500)


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
    # 페이지네이션용 전체 건수 (limit/offset 과 무관한 사용자별 총 기록 수)
    total: int = 0


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_heading_input(
    request: Request,
    file:    UploadFile = File(..., description="분석할 마케팅 이미지"),
) -> HeadingInput:
    """이미지 업로드 검증 후 HeadingInput 반환."""
    validate_content_length(request)
    file_bytes, filename = await read_and_check_file(file)
    return HeadingInput(file_bytes=file_bytes, filename=filename)
