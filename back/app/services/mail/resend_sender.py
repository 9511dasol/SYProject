from app.services.mail.base import AbstractMailSender, MailSendError


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

        try:
            result = resend.Emails.send(
                {
                    "from": self._from,
                    "to": to,
                    "subject": subject,
                    "html": html,
                }
            )
        except Exception as exc:
            raise MailSendError(f"Resend 발송에 실패했습니다: {exc}") from exc

        # SDK 버전에 따라 실패를 예외가 아니라 {"error": ...} 응답으로 돌려주기도
        # 한다. 그대로 두면 실패가 ReportLog 에 "sent" 로 남아 발송 실패가 은폐된다.
        error = result.get("error") if isinstance(result, dict) else getattr(result, "error", None)
        if error:
            raise MailSendError(f"Resend 발송에 실패했습니다: {error}")
