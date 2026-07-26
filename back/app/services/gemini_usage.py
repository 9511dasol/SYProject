"""Gemini 응답에서 토큰 사용량을 뽑아내는 공용 헬퍼.

image_ai_edit_service(이미지 정제/업스케일)와 heading_service(헤딩 문구 추천)가
서로 다른 google-genai 호출 경로를 쓰지만 응답의 usage_metadata 형태는 동일해서 공유한다.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    @classmethod
    def from_response(cls, response: Any) -> "TokenUsage | None":
        meta = getattr(response, "usage_metadata", None)
        if meta is None:
            return None
        return cls(
            prompt_tokens=meta.prompt_token_count,
            output_tokens=meta.candidates_token_count,
            total_tokens=meta.total_token_count,
        )
