from abc import ABC, abstractmethod


class AbstractMailSender(ABC):
    @abstractmethod
    def send(self, to: list[str], subject: str, html: str) -> None:
        """HTML 메일을 발송합니다. 실패 시 예외를 raise합니다."""
