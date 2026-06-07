import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.services.mail.base import AbstractMailSender


class SmtpSender(AbstractMailSender):
    """SSL SMTP를 이용한 메일 발송 (Gmail 등)"""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_email: str,
    ):
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._from = from_email

    def send(self, to: list[str], subject: str, html: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self._from
        msg["To"] = ", ".join(to)
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP_SSL(self._host, self._port) as smtp:
            smtp.login(self._username, self._password)
            smtp.sendmail(self._from, to, msg.as_string())
