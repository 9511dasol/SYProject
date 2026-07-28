import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.services.mail.base import AbstractMailSender, MailSendError

_GMAIL_HOSTS = ("smtp.gmail.com", "smtp.googlemail.com")


def _auth_help(host: str, username: str) -> str:
    """인증 실패 안내는 실제로 접속한 서버에 맞춰야 한다.

    예전에는 무조건 'Gmail 앱 비밀번호를 발급하라'고 안내했는데, 자체 메일 서버를
    쓰면서 SMTP_HOST만 smtp.gmail.com으로 남아 있는 경우(가장 흔한 설정 실수)에는
    엉뚱한 처방이라 문제를 더 헤매게 만든다. 계정 도메인과 서버가 어긋났으면
    그 사실부터 짚어 준다.
    """
    domain = username.rpartition("@")[2].lower()
    is_gmail_host = host.lower() in _GMAIL_HOSTS
    is_gmail_account = domain in ("gmail.com", "googlemail.com")

    if is_gmail_host and not is_gmail_account and domain:
        return (
            f"SMTP 인증에 실패했습니다. 계정은 '{username}'인데 서버는 Gmail({host})로 지정돼 "
            f"있습니다 — 구글에 없는 계정이라 어떤 비밀번호로도 로그인되지 않습니다. "
            f"'{domain}' 도메인의 실제 메일 서버 주소를 SMTP_HOST에 넣으세요 "
            f"(MX 레코드로 확인할 수 있습니다)."
        )
    if is_gmail_host:
        return (
            "SMTP 인증에 실패했습니다. Gmail은 계정 비밀번호로는 로그인되지 않습니다 — "
            "2단계 인증을 켠 뒤 발급한 16자리 앱 비밀번호를 SMTP_PASSWORD에 넣고, "
            "SMTP_USERNAME/SMTP_FROM이 그 계정 주소와 같은지 확인하세요."
        )
    return (
        f"SMTP 인증에 실패했습니다. {host} 에 '{username}' 으로 로그인하지 못했습니다 — "
        f"SMTP_USERNAME/SMTP_PASSWORD가 해당 메일 계정의 로그인 정보와 같은지, "
        f"그 계정에 SMTP 발송 권한이 있는지 확인하세요."
    )


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

        try:
            self._deliver(to, msg.as_string())
        except smtplib.SMTPAuthenticationError as exc:
            raise MailSendError(_auth_help(self._host, self._username)) from exc
        except smtplib.SMTPRecipientsRefused as exc:
            rejected = ", ".join(exc.recipients)
            raise MailSendError(f"받는 사람 주소가 거부되었습니다: {rejected}") from exc
        except smtplib.SMTPSenderRefused as exc:
            raise MailSendError(
                f"보내는 사람 주소({self._from})가 거부되었습니다. SMTP_FROM을 확인하세요."
            ) from exc
        except (smtplib.SMTPException, OSError) as exc:
            raise MailSendError(
                f"메일 서버({self._host}:{self._port}) 연결/발송에 실패했습니다: {exc}"
            ) from exc

    def _deliver(self, to: list[str], body: str) -> None:
        """465는 처음부터 SSL, 그 외(587/25)는 평문으로 붙어 STARTTLS로 승격한다.

        예전에는 SMTP_SSL만 썼다. 자체 메일 서버 중에는 465를 막고 587만 여는 곳이
        많아서, 그런 서버로 바꾸면 곧바로 연결 단계에서 깨진다.
        """
        if self._port == 465:
            with smtplib.SMTP_SSL(self._host, self._port, timeout=30) as smtp:
                smtp.login(self._username, self._password)
                smtp.sendmail(self._from, to, body)
            return

        with smtplib.SMTP(self._host, self._port, timeout=30) as smtp:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
                smtp.ehlo()
            smtp.login(self._username, self._password)
            smtp.sendmail(self._from, to, body)
