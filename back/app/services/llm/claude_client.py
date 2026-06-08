from app.services.llm.base import AbstractLLMClient


class ClaudeClient(AbstractLLMClient):
    """Anthropic Claude 클라이언트 (anthropic 패키지 설치 필요: pip install anthropic)"""

    def __init__(self, api_key: str, model: str = "claude-opus-4-8"):
        try:
            import anthropic
        except ImportError as e:
            raise ImportError("pip install anthropic 후 사용하세요.") from e
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def generate(self, prompt: str) -> str:
        import anthropic

        message = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        block = message.content[0]
        if isinstance(block, anthropic.types.TextBlock):
            return block.text
        return ""
