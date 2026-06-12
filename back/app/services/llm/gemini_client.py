from google import genai

from app.services.llm.base import AbstractLLMClient


class GeminiClient(AbstractLLMClient):
    """Google Gemini 클라이언트 (google-genai 패키지 사용)"""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def generate(self, prompt: str) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
        )
        return response.text or ""
