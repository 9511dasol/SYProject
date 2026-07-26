"""AI 기반 이미지 편집 서비스.

업로드된 이미지 + 자유 텍스트 프롬프트를 Gemini 이미지 생성 모델에 전달해
프롬프트가 지시하는 대로 수정된 이미지를 돌려받고, 필요 시 지정된 크기로
리사이즈해 반환한다.
"""

import io

from PIL import Image

from app.core.settings import settings
from app.services.gemini_usage import TokenUsage
from app.services.image_ai_edit_service import generate_image
from app.services.image_resize_service import resize_image

# ── 예외 ──────────────────────────────────────────────────────────────────────

class ImageEditError(Exception):
    """AI 이미지 편집 실패 (API 키 미설정, 응답 오류 등)."""


# ── 원본 포맷 → MIME 매핑 ────────────────────────────────────────────────────

_MIME_BY_PIL_FORMAT: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG":  "image/png",
    "WEBP": "image/webp",
    "GIF":  "image/gif",
    "BMP":  "image/bmp",
}


def _detect_mime(file_bytes: bytes) -> str:
    with Image.open(io.BytesIO(file_bytes)) as img:
        return _MIME_BY_PIL_FORMAT.get(img.format or "", "image/png")


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

def edit_and_resize(
    file_bytes:        bytes,
    original_filename: str,
    prompt:             str,
    target_width:       int | None,
    target_height:      int | None,
    output_format:      str = "jpeg",
) -> tuple[io.BytesIO, str, str, str, TokenUsage | None]:
    """
    Returns
    -------
    (buffer, download_filename, content_type, ai_provider_label, token_usage)

    Raises
    ------
    ImageEditError — AI 편집 실패
    """
    mime_type = _detect_mime(file_bytes)

    result = generate_image(file_bytes, prompt, mime_type=mime_type)
    if result is None:
        raise ImageEditError("AI 이미지 편집에 실패했습니다. 잠시 후 다시 시도해주세요.")

    buf, download_name, content_type, _, _ = resize_image(
        file_bytes=result.image_bytes,
        original_filename=original_filename,
        target_width=target_width,
        target_height=target_height,
        output_format=output_format,
    )

    return buf, download_name, content_type, f"Gemini ({settings.GEMINI_IMAGE_MODEL})", result.usage
