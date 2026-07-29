"""Gemini 이미지 생성 모델을 이용한 범용 이미지 편집/생성.

원본 이미지 + 자유 텍스트 프롬프트를 Gemini image-generation 모델에 넘겨
프롬프트가 지시하는 대로 수정된 이미지를 돌려받는다. 업스케일(디테일 보강)도
결국 "이런 식으로 이미지를 바꿔줘"라는 프롬프트의 특수 케이스라 같은 함수를
공유한다.
"""

from dataclasses import dataclass

from google import genai
from google.genai import types

from app.core.settings import settings
from app.services.token_usage import TokenUsage

_client: genai.Client | None = None


def _gemini() -> genai.Client | None:
    global _client
    if _client is None and settings.GEMINI_API_KEY:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


@dataclass(frozen=True)
class ImageGenResult:
    image_bytes: bytes
    usage: TokenUsage | None


def generate_image(image_bytes: bytes, prompt: str, mime_type: str = "image/png") -> ImageGenResult | None:
    """프롬프트에 따라 편집된 이미지 바이트(+토큰 사용량)를 반환. 실패 시 None."""
    client = _gemini()
    if client is None:
        return None

    try:
        resp = client.models.generate_content(
            model=settings.GEMINI_IMAGE_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
        )
    except Exception:
        return None

    candidates = resp.candidates or []
    if not candidates:
        return None

    for part in candidates[0].content.parts or []:
        inline = getattr(part, "inline_data", None)
        if inline and inline.data:
            return ImageGenResult(image_bytes=inline.data, usage=TokenUsage.from_gemini_response(resp))

    return None


_UPSCALE_PROMPT = (
    "Upscale this image to a higher resolution. "
    "Reconstruct fine detail and sharpen edges as a photo enhancer would, "
    "but keep the composition, colors, and content exactly the same — "
    "do not add, remove, or alter any elements. Output only the image."
)


def ai_upscale(image_bytes: bytes, mime_type: str = "image/png") -> ImageGenResult | None:
    """AI로 업스케일된 이미지 바이트(+토큰 사용량)를 반환. 실패 시 None."""
    return generate_image(image_bytes, _UPSCALE_PROMPT, mime_type)
