from openai import OpenAI

from app.core.settings import settings
from app.services.llm.base import AbstractLLMClient
from app.services.token_usage import TokenUsage


class OpenAIClient(AbstractLLMClient):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        # timeout/max_retries 를 주지 않으면 공급자 지연 시 호출이 무한정 매달린다.
        self._client = OpenAI(
            api_key=api_key,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
        )
        self._model = model

    def generate_with_usage(self, prompt: str) -> tuple[str, TokenUsage | None]:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        text = response.choices[0].message.content or ""

        usage = getattr(response, "usage", None)
        if usage is None:
            return text, None
        return text, TokenUsage.of(
            usage.prompt_tokens, usage.completion_tokens, usage.total_tokens
        )
