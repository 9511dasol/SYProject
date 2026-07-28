from abc import ABC, abstractmethod


class MailSendError(Exception):
    """메일 발송 실패 — 사용자에게 그대로 보여줄 수 있는 한국어 메시지를 담는다.

    smtplib/Resend가 던지는 원문 예외는 그대로 노출하면 무슨 조치를 해야 할지 알 수 없어서,
    각 sender가 원인별 안내 문구로 바꿔 이 예외로 감싼다.
    """


class AbstractMailSender(ABC):
    @abstractmethod
    def send(self, to: list[str], subject: str, html: str) -> None:
        """HTML 메일을 발송합니다. 실패 시 MailSendError를 raise합니다."""
