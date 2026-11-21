"""Gemini 이미지 생성 모델을 이용한 범용 이미지 편집/생성.

원본 이미지 + 자유 텍스트 프롬프트를 Gemini image-generation 모델에 넘겨
프롬프트가 지시하는 대로 수정된 이미지를 돌려받는다. 업스케일(디테일 보강)도
결국 "이런 식으로 이미지를 바꿔줘"라는 프롬프트의 특수 케이스라 같은 함수를
공유한다.
"""

import logging
from dataclasses import dataclass

from google import genai
from google.genai import types

from app.core.settings import settings
from app.services.genai_options import build_genai_client
from app.services.token_usage import TokenUsage

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def _gemini() -> genai.Client | None:
    global _client
    # 전용 키/공용 키 폴백은 GEMINI_IMAGE_KEY 가 결정한다 — 여기서 공용 키만
    # 검사하면 이미지 전용 키만 설정한 배포에서 기능이 조용히 죽는다.
    if _client is None and settings.GEMINI_IMAGE_KEY:
        # 이미지 생성은 텍스트보다 오래 걸려 전용(더 긴) 타임아웃을 쓴다.
        _client = build_genai_client(settings.GEMINI_IMAGE_KEY, image=True)
    return _client


@dataclass(frozen=True)
class ImageGenResult:
    image_bytes: bytes
    usage: TokenUsage | None


def generate_image(image_bytes: bytes, prompt: str, mime_type: str = "image/png") -> ImageGenResult | None:
    """프롬프트에 따라 편집된 이미지 바이트(+토큰 사용량)를 반환. 실패 시 None."""
    client = _gemini()
    if client is None:
        logger.warning("Gemini 이미지 클라이언트 미설정 — GEMINI_IMAGE_KEY 를 확인하세요")
        return None

    # None 반환은 호출자에게 전부 같은 "실패"로 보인다. 쿼터 초과·키 오류·타임아웃을
    # 구분할 수 있는 곳이 여기뿐이므로, 원인은 반드시 서버 로그에 남긴다 —
    # 예전에는 무로깅으로 삼켜서 운영 중 원인 파악이 불가능했다.
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
        logger.exception(
            "Gemini 이미지 생성 호출 실패 (model=%s, prompt=%.80s)",
            settings.GEMINI_IMAGE_MODEL, prompt,
        )
        return None

    candidates = resp.candidates or []
    if not candidates:
        logger.warning(
            "Gemini 이미지 생성 응답에 후보가 없음 (model=%s, prompt=%.80s)",
            settings.GEMINI_IMAGE_MODEL, prompt,
        )
        return None

    for part in candidates[0].content.parts or []:
        inline = getattr(part, "inline_data", None)
        if inline and inline.data:
            return ImageGenResult(image_bytes=inline.data, usage=TokenUsage.from_gemini_response(resp))

    logger.warning(
        "Gemini 이미지 생성 응답에 이미지 파트가 없음 (model=%s, prompt=%.80s)",
        settings.GEMINI_IMAGE_MODEL, prompt,
    )
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
