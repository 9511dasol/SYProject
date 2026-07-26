from app.core.settings import settings
from app.services.llm.base import AbstractLLMClient


def build_llm() -> AbstractLLMClient:
    from app.services.llm.claude_client import ClaudeClient
    from app.services.llm.gemini_client import GeminiClient
    from app.services.llm.openai_client import OpenAIClient

    if settings.LLM_PROVIDER == "claude":
        return ClaudeClient(api_key=settings.ANTHROPIC_API_KEY, model=settings.CLAUDE_MODEL)
    if settings.LLM_PROVIDER == "gemini":
        return GeminiClient(api_key=settings.GEMINI_API_KEY, model=settings.GEMINI_MODEL)
    return OpenAIClient(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_MODEL)
