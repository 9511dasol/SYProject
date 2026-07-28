"""엑셀 메일 발송 경로 테스트 — 받는 사람 파싱, 설정 점검, SMTP 오류 번역."""

import smtplib

import pytest
from fastapi import HTTPException

from app.routers.marketing_router import _clean_recipients
from app.services import mail as mail_module
from app.services.mail import mail_config_error
from app.services.mail.base import MailSendError
from app.services.mail.smtp_sender import SmtpSender


class TestCleanRecipients:
    def test_defaults_to_logged_in_user(self):
        assert _clean_recipients(None, "me@example.com") == ["me@example.com"]
        assert _clean_recipients([], "me@example.com") == ["me@example.com"]

    def test_splits_comma_separated_value(self):
        assert _clean_recipients(["a@x.com,b@y.com"], "me@x.com") == ["a@x.com", "b@y.com"]

    def test_accepts_repeated_params_and_trims(self):
        assert _clean_recipients(["a@x.com", " b@y.com "], "me@x.com") == ["a@x.com", "b@y.com"]

    def test_drops_duplicates_keeping_order(self):
        assert _clean_recipients(["b@y.com", "a@x.com", "b@y.com"], "me@x.com") == [
            "b@y.com",
            "a@x.com",
        ]

    @pytest.mark.parametrize("bad", ["bad", "no-at-sign.com", "a@b", "a b@c.com"])
    def test_rejects_malformed_address(self, bad):
        with pytest.raises(HTTPException) as exc:
            _clean_recipients([bad], "me@x.com")
        assert exc.value.status_code == 400
        assert bad in exc.value.detail

    def test_rejects_too_many_recipients(self):
        many = [f"u{i}@x.com" for i in range(11)]
        with pytest.raises(HTTPException) as exc:
            _clean_recipients(many, "me@x.com")
        assert exc.value.status_code == 400
        assert "최대 10명" in exc.value.detail

    def test_requires_address_when_user_has_no_email(self):
        with pytest.raises(HTTPException) as exc:
            _clean_recipients(None, "")
        assert exc.value.status_code == 400


class TestMailConfigError:
    """엑셀을 다 만든 뒤에야 설정 문제로 실패하지 않도록, 시작 전에 걸러내는 검사."""

    def _settings(self, monkeypatch, **overrides):
        defaults = {
            "MAIL_ENABLED": True,
            "MAIL_PROVIDER": "smtp",
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_USERNAME": "u",
            "SMTP_PASSWORD": "p",
            "SMTP_FROM": "u",
            "RESEND_API_KEY": "",
            "RESEND_FROM": "",
        }
        for key, value in {**defaults, **overrides}.items():
            monkeypatch.setattr(mail_module.settings, key, value, raising=False)

    def test_none_when_smtp_fully_configured(self, monkeypatch):
        self._settings(monkeypatch)
        assert mail_config_error() is None

    def test_reports_disabled_flag(self, monkeypatch):
        self._settings(monkeypatch, MAIL_ENABLED=False)
        assert "비활성화" in mail_config_error()

    def test_lists_missing_smtp_keys(self, monkeypatch):
        self._settings(monkeypatch, SMTP_PASSWORD="", SMTP_FROM="")
        msg = mail_config_error()
        assert "SMTP_PASSWORD" in msg and "SMTP_FROM" in msg
        assert "SMTP_HOST" not in msg

    def test_checks_resend_keys_when_provider_is_resend(self, monkeypatch):
        self._settings(monkeypatch, MAIL_PROVIDER="resend")
        msg = mail_config_error()
        assert "RESEND_API_KEY" in msg and "RESEND_FROM" in msg

    def test_resend_configured_passes(self, monkeypatch):
        self._settings(monkeypatch, MAIL_PROVIDER="resend", RESEND_API_KEY="k", RESEND_FROM="f@x.com")
        assert mail_config_error() is None


class _FailingSmtp:
    """with 문에서 login 시 지정한 예외를 던지는 SMTP_SSL 대역."""

    def __init__(self, exc):
        self._exc = exc

    def __call__(self, *_args, **_kwargs):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def login(self, *_args):
        raise self._exc

    def sendmail(self, *_args):
        raise AssertionError("login 실패 후에는 호출되면 안 된다")


class TestSmtpErrorTranslation:
    """원문 예외를 그대로 노출하면 무슨 조치를 해야 할지 알 수 없다."""

    def _send(self, monkeypatch, exc, host="smtp.gmail.com", username="u@gmail.com"):
        monkeypatch.setattr(smtplib, "SMTP_SSL", _FailingSmtp(exc))
        sender = SmtpSender(host, 465, username, "pw", username)
        with pytest.raises(MailSendError) as caught:
            sender.send(["to@x.com"], "제목", "<p>본문</p>")
        return str(caught.value)

    _AUTH_ERROR = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")

    def test_gmail_account_on_gmail_host_explains_app_password(self, monkeypatch):
        msg = self._send(monkeypatch, self._AUTH_ERROR)
        assert "앱 비밀번호" in msg
        assert "SMTP_PASSWORD" in msg

    def test_non_gmail_account_on_gmail_host_flags_the_mismatch(self, monkeypatch):
        # 가장 흔한 설정 실수 — 자체 도메인 계정인데 SMTP_HOST만 gmail로 남은 경우.
        # 여기서 '앱 비밀번호를 발급하라'고 안내하면 문제를 더 헤매게 된다.
        msg = self._send(monkeypatch, self._AUTH_ERROR, username="me@ainuri.kr")
        assert "SMTP_HOST" in msg
        assert "ainuri.kr" in msg
        assert "앱 비밀번호" not in msg

    def test_custom_host_gets_generic_credential_guidance(self, monkeypatch):
        msg = self._send(
            monkeypatch, self._AUTH_ERROR, host="webmail.ainuri.kr", username="me@ainuri.kr"
        )
        assert "webmail.ainuri.kr" in msg
        assert "SMTP_PASSWORD" in msg
        assert "앱 비밀번호" not in msg

    def test_sender_refused_points_at_from_setting(self, monkeypatch):
        msg = self._send(monkeypatch, smtplib.SMTPSenderRefused(553, b"denied", "u@x.com"))
        assert "SMTP_FROM" in msg

    def test_recipients_refused_lists_addresses(self, monkeypatch):
        msg = self._send(monkeypatch, smtplib.SMTPRecipientsRefused({"to@x.com": (550, b"no")}))
        assert "to@x.com" in msg

    def test_connection_error_is_wrapped(self, monkeypatch):
        msg = self._send(monkeypatch, OSError("connection refused"))
        assert "연결" in msg and "smtp.gmail.com" in msg


class _RecordingSmtp:
    """평문 SMTP 대역 — STARTTLS 승격 여부를 기록한다."""

    def __init__(self, starttls_supported: bool):
        self._supported = starttls_supported
        self.started_tls = False
        self.sent = False

    def __call__(self, *_args, **_kwargs):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def ehlo(self):
        return 250, b"ok"

    def has_extn(self, name):
        return name == "starttls" and self._supported

    def starttls(self):
        self.started_tls = True

    def login(self, *_args):
        return None

    def sendmail(self, *_args):
        self.sent = True


class TestPortHandling:
    """465는 암시적 SSL, 587/25는 STARTTLS 승격."""

    def test_port_587_upgrades_with_starttls(self, monkeypatch):
        fake = _RecordingSmtp(starttls_supported=True)
        monkeypatch.setattr(smtplib, "SMTP", fake)
        SmtpSender("mail.example.com", 587, "u@x.com", "pw", "u@x.com").send(
            ["to@x.com"], "제목", "<p>본문</p>"
        )
        assert fake.started_tls is True
        assert fake.sent is True

    def test_port_587_without_starttls_still_sends(self, monkeypatch):
        fake = _RecordingSmtp(starttls_supported=False)
        monkeypatch.setattr(smtplib, "SMTP", fake)
        SmtpSender("mail.example.com", 587, "u@x.com", "pw", "u@x.com").send(
            ["to@x.com"], "제목", "<p>본문</p>"
        )
        assert fake.started_tls is False
        assert fake.sent is True

    def test_port_465_uses_implicit_ssl(self, monkeypatch):
        fake = _RecordingSmtp(starttls_supported=True)
        monkeypatch.setattr(smtplib, "SMTP_SSL", fake)
        monkeypatch.setattr(
            smtplib, "SMTP", lambda *a, **k: pytest.fail("465에서는 평문 SMTP를 쓰면 안 된다")
        )
        SmtpSender("mail.example.com", 465, "u@x.com", "pw", "u@x.com").send(
            ["to@x.com"], "제목", "<p>본문</p>"
        )
        assert fake.started_tls is False
        assert fake.sent is True
