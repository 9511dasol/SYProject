from pydantic import BaseModel


class AIProviderStatus(BaseModel):
    key: str
    label: str
    model: str
    api_key_configured: bool
    is_active: bool


class AIStatusOut(BaseModel):
    active_provider: str
    providers: list[AIProviderStatus]
