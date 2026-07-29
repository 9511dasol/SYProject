from google import genai

from app.services.llm.base import AbstractLLMClient
from app.services.token_usage import TokenUsage


class GeminiClient(AbstractLLMClient):
    """Google Gemini 클라이언트 (google-genai 패키지 사용)"""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def generate_with_usage(self, prompt: str) -> tuple[str, TokenUsage | None]:
        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
        )
        return response.text or "", TokenUsage.from_gemini_response(response)
