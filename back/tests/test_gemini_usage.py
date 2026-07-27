"""gemini_usage.TokenUsage 테스트."""

from types import SimpleNamespace

from app.services.gemini_usage import TokenUsage


def test_from_response_with_usage_metadata():
    response = SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=40,
            total_token_count=140,
        )
    )
    usage = TokenUsage.from_response(response)
    assert usage == TokenUsage(prompt_tokens=100, output_tokens=40, total_tokens=140)


def test_from_response_without_usage_metadata_returns_none():
    response = SimpleNamespace(usage_metadata=None)
    assert TokenUsage.from_response(response) is None


def test_from_response_missing_attr_returns_none():
    # usage_metadata 속성 자체가 없는 응답(구버전 등)
    assert TokenUsage.from_response(SimpleNamespace()) is None
