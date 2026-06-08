"""이미지 리사이즈 — 요청 스키마 및 검증 Dependency.

검증 로직을 이곳에 집중시켜 router 를 얇게 유지합니다.
image_filter_schema 가 공통 상수·헬퍼를 import 해 재사용합니다.
"""

from dataclasses import dataclass

from fastapi import File, Form, HTTPException, Request, UploadFile

# ── 공통 업로드 상수 ───────────────────────────────────────────────────────────

MAX_UPLOAD_BYTES: int = 50 * 1_024 * 1_024  # 50 MB

ALLOWED_FORMATS: frozenset[str] = frozenset({"jpeg", "png", "webp"})

ALLOWED_MIME: frozenset[str] = frozenset({
    "image/jpeg", "image/jpg", "image/png",
    "image/webp", "image/gif", "image/bmp",
    "image/tiff", "image/x-bmp",
})

# ── 검증된 입력 컨테이너 ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class ResizeInput:
    file_bytes:    bytes
    filename:      str
    width:         int | None
    height:        int | None
    output_format: str


# ── 공통 검증 헬퍼 (image_filter_schema 에서도 import) ────────────────────────

def validate_content_length(request: Request) -> None:
    """Content-Length 헤더로 1차 용량 검사."""
    raw_cl = request.headers.get("content-length")
    if raw_cl and int(raw_cl) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="파일 크기가 50MB를 초과합니다.")


def normalize_format(fmt: str) -> str:
    """포맷 소문자 정규화 + 허용 목록 검사 → 정규화된 포맷 반환."""
    fmt = fmt.lower().strip()
    if fmt == "jpg":
        fmt = "jpeg"
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 포맷입니다. 허용: {', '.join(sorted(ALLOWED_FORMATS))}",
        )
    return fmt


async def read_and_check_file(file: UploadFile) -> tuple[bytes, str]:
    """파일 바이트 읽기 + 실제 크기·MIME 검사 → (bytes, filename) 반환."""
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="파일 크기가 50MB를 초과합니다.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    mime = (file.content_type or "").lower().split(";")[0].strip()
    if mime and mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail="지원하지 않는 이미지 형식입니다. JPEG · PNG · WebP · GIF · BMP를 사용하세요.",
        )

    return file_bytes, file.filename or "image"


# ── FastAPI Dependency ────────────────────────────────────────────────────────

async def get_resize_input(
    request: Request,
    file:   UploadFile    = File(...,  description="리사이즈할 이미지"),
    width:  int | None    = Form(None, ge=1, le=99_999, description="목표 가로 (px)"),
    height: int | None    = Form(None, ge=1, le=99_999, description="목표 세로 (px)"),
    format: str           = Form("jpeg", description="출력 포맷: jpeg | png | webp"),
) -> ResizeInput:
    """이미지 업로드 파라미터 전체 검증 후 ResizeInput 반환."""
    validate_content_length(request)
    fmt = normalize_format(format)
    file_bytes, filename = await read_and_check_file(file)
    return ResizeInput(
        file_bytes=file_bytes,
        filename=filename,
        width=width,
        height=height,
        output_format=fmt,
    )
