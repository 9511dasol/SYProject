from app.services.mail.base import AbstractMailSender


class ResendSender(AbstractMailSender):
    """Resend API를 이용한 메일 발송 (pip install resend 필요)"""

    def __init__(self, api_key: str, from_email: str):
        try:
            import resend as _resend
        except ImportError as e:
            raise ImportError("pip install resend 후 사용하세요.") from e
        _resend.api_key = api_key
        self._from = from_email

    def send(self, to: list[str], subject: str, html: str) -> None:
        import resend

        resend.Emails.send(
            {
                "from": self._from,
                "to": to,
                "subject": subject,
                "html": html,
            }
        )
