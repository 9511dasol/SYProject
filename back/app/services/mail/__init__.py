from app.core.settings import settings
from app.services.mail.base import AbstractMailSender, MailSendError

__all__ = ["AbstractMailSender", "MailSendError", "build_mail_sender", "mail_config_error"]


def mail_config_error() -> str | None:
    """메일 설정이 비어 있으면 그 이유를, 문제없으면 None을 반환한다.

    설정이 비었는데도 발송을 시도하면 엑셀을 다 만든 뒤에야 실패해서 시간이 버려진다.
    요청을 받는 즉시 이걸로 걸러 400을 돌려준다. (자격증명이 '틀린' 경우는 여기서 알 수
    없고, 실제 발송 시 MailSendError로 걸린다.)
    """
    if not settings.MAIL_ENABLED:
        return "메일 발송 기능이 비활성화되어 있습니다. (MAIL_ENABLED=false)"

    if settings.MAIL_PROVIDER == "resend":
        missing = [
            name
            for name, value in (
                ("RESEND_API_KEY", settings.RESEND_API_KEY),
                ("RESEND_FROM", settings.RESEND_FROM),
            )
            if not value
        ]
    else:
        missing = [
            name
            for name, value in (
                ("SMTP_HOST", settings.SMTP_HOST),
                ("SMTP_USERNAME", settings.SMTP_USERNAME),
                ("SMTP_PASSWORD", settings.SMTP_PASSWORD),
                ("SMTP_FROM", settings.SMTP_FROM),
            )
            if not value
        ]

    if missing:
        return f"메일 설정이 비어 있습니다: {', '.join(missing)}"
    return None


def build_mail_sender() -> AbstractMailSender:
    if settings.MAIL_PROVIDER == "resend":
        from app.services.mail.resend_sender import ResendSender
        return ResendSender(api_key=settings.RESEND_API_KEY, from_email=settings.RESEND_FROM)
    from app.services.mail.smtp_sender import SmtpSender
    return SmtpSender(
        host=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        from_email=settings.SMTP_FROM,
    )
