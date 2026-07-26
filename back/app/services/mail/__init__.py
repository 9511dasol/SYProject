from app.core.settings import settings
from app.services.mail.base import AbstractMailSender


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
