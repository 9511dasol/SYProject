from abc import ABC, abstractmethod


class AbstractLLMClient(ABC):
    @abstractmethod
    def generate(self, prompt: str) -> str:
        """프롬프트를 받아 텍스트 응답을 반환합니다."""
