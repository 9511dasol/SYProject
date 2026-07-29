from app.services.llm.base import AbstractLLMClient
from app.services.token_usage import TokenUsage


class ClaudeClient(AbstractLLMClient):
    """Anthropic Claude 클라이언트 (anthropic 패키지 설치 필요: pip install anthropic)"""

    def __init__(self, api_key: str, model: str = "claude-opus-4-8"):
        try:
            import anthropic
        except ImportError as e:
            raise ImportError("pip install anthropic 후 사용하세요.") from e
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def generate_with_usage(self, prompt: str) -> tuple[str, TokenUsage | None]:
        import anthropic

        message = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        block = message.content[0] if message.content else None
        text = block.text if isinstance(block, anthropic.types.TextBlock) else ""
        return text, _usage_of(message)


def _usage_of(message) -> TokenUsage | None:
    """Anthropic 응답의 usage → TokenUsage.

    Anthropic 은 total 을 주지 않아 합계를 직접 만든다. 입력 토큰은 캐시 읽기/쓰기가
    별도 필드로 빠지므로(지금은 프롬프트 캐싱을 쓰지 않아 0이지만) 함께 더해야
    실제 청구량과 맞는다.
    """
    usage = getattr(message, "usage", None)
    if usage is None:
        return None

    prompt_tokens = (
        (getattr(usage, "input_tokens", 0) or 0)
        + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
        + (getattr(usage, "cache_read_input_tokens", 0) or 0)
    )
    return TokenUsage.of(prompt_tokens, getattr(usage, "output_tokens", 0) or 0)
