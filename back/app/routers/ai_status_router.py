from fastapi import APIRouter, Depends

from app.core.security import require_admin
from app.core.settings import settings
from app.models.user_model import User
from app.schemas.ai_status_schema import AIProviderStatus, AIStatusOut

router = APIRouter(prefix="/api/admin/ai-status", tags=["admin-ai-status"])

_PROVIDER_LABELS = {
    "openai": "OpenAI",
    "claude": "Claude (Anthropic)",
    "gemini": "Gemini (Google)",
}


@router.get("", response_model=AIStatusOut, summary="AI 프로바이더 현황 조회")
def get_ai_status(_admin: User = Depends(require_admin)) -> AIStatusOut:
    """현재 LLM_PROVIDER, 모델, API 키 설정 여부를 반환합니다. 실제 키 값은 노출하지 않습니다."""
    providers = [
        AIProviderStatus(
            key="openai",
            label=_PROVIDER_LABELS["openai"],
            model=settings.OPENAI_MODEL,
            api_key_configured=bool(settings.OPENAI_API_KEY),
            is_active=settings.LLM_PROVIDER == "openai",
        ),
        AIProviderStatus(
            key="claude",
            label=_PROVIDER_LABELS["claude"],
            model=settings.CLAUDE_MODEL,
            api_key_configured=bool(settings.ANTHROPIC_API_KEY),
            is_active=settings.LLM_PROVIDER == "claude",
        ),
        AIProviderStatus(
            key="gemini",
            label=_PROVIDER_LABELS["gemini"],
            model=settings.GEMINI_MODEL,
            api_key_configured=bool(settings.GEMINI_API_KEY),
            is_active=settings.LLM_PROVIDER == "gemini",
        ),
    ]
    return AIStatusOut(active_provider=settings.LLM_PROVIDER, providers=providers)
