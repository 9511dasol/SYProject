"""LLM 호출 1건의 토큰 사용량.

이미지·헤딩(Gemini)과 코멘트 생성(LLM_PROVIDER 에 따라 Claude/OpenAI/Gemini)이
같은 표(ai_tool_usage_logs)에 한 줄로 들어가므로, 제공자와 무관한 공통 형태를 여기 둔다.
응답에서 값을 꺼내는 방법만 제공자마다 다르다 — 각 클라이언트가 맡는다.

예전 이름은 gemini_usage.TokenUsage 였는데, 코멘트 생성이 Claude·OpenAI 로도 나가면서
'gemini' 라는 이름이 사실과 어긋나 옮겼다.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    @classmethod
    def from_gemini_response(cls, response: Any) -> "TokenUsage | None":
        """google-genai 응답의 usage_metadata → TokenUsage.

        이미지 정제/업스케일과 헤딩 문구 추천이 서로 다른 호출 경로를 쓰지만
        usage_metadata 형태는 같아서 공유한다. 못 얻으면 None.
        """
        meta = getattr(response, "usage_metadata", None)
        if meta is None:
            return None
        return cls(
            prompt_tokens=meta.prompt_token_count,
            output_tokens=meta.candidates_token_count,
            total_tokens=meta.total_token_count,
        )

    @classmethod
    def of(cls, prompt: int | None, output: int | None, total: int | None = None) -> "TokenUsage":
        """total 을 주지 않는 제공자(Anthropic)를 위해 합계를 채워 준다."""
        if total is None and (prompt is not None or output is not None):
            total = (prompt or 0) + (output or 0)
        return cls(prompt_tokens=prompt, output_tokens=output, total_tokens=total)
