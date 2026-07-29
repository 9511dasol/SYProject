"""token_usage.TokenUsage — 제공자별 응답에서 토큰 사용량 뽑아내기."""

from types import SimpleNamespace

from app.services.token_usage import TokenUsage


class TestFromGeminiResponse:
    def test_with_usage_metadata(self):
        response = SimpleNamespace(
            usage_metadata=SimpleNamespace(
                prompt_token_count=100,
                candidates_token_count=40,
                total_token_count=140,
            )
        )
        usage = TokenUsage.from_gemini_response(response)
        assert usage == TokenUsage(prompt_tokens=100, output_tokens=40, total_tokens=140)

    def test_without_usage_metadata_returns_none(self):
        assert TokenUsage.from_gemini_response(SimpleNamespace(usage_metadata=None)) is None

    def test_missing_attr_returns_none(self):
        # usage_metadata 속성 자체가 없는 응답(구버전 등)
        assert TokenUsage.from_gemini_response(SimpleNamespace()) is None


class TestOf:
    def test_total_is_summed_when_absent(self):
        """Anthropic 은 total 을 주지 않는다 — 합계를 채워 줘야 예산 집계에 잡힌다."""
        assert TokenUsage.of(100, 40) == TokenUsage(
            prompt_tokens=100, output_tokens=40, total_tokens=140
        )

    def test_given_total_is_kept(self):
        assert TokenUsage.of(100, 40, 999).total_tokens == 999

    def test_all_none_stays_none(self):
        assert TokenUsage.of(None, None) == TokenUsage(None, None, None)

    def test_partial_counts_still_produce_a_total(self):
        assert TokenUsage.of(100, None).total_tokens == 100
