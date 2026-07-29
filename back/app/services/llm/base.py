from abc import ABC, abstractmethod

from app.services.token_usage import TokenUsage


class AbstractLLMClient(ABC):
    @abstractmethod
    def generate_with_usage(self, prompt: str) -> tuple[str, TokenUsage | None]:
        """프롬프트를 받아 (텍스트, 토큰 사용량)을 반환합니다.

        사용량을 못 얻으면 None — 호출부는 기록을 건너뛴다. 응답에서 사용량을 꺼내는
        방법은 제공자마다 달라 각 클라이언트가 구현한다.
        """

    def generate(self, prompt: str) -> str:
        """텍스트만 필요할 때. 사용량을 기록하려면 generate_with_usage 를 쓴다."""
        return self.generate_with_usage(prompt)[0]
