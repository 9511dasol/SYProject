"""ResendSender 의 실패 감지.

Resend SDK 는 버전에 따라 실패를 예외가 아니라 {"error": ...} 응답으로 돌려준다.
예전 구현은 예외만 잡아서, 그런 실패가 ReportLog 에 "sent" 로 남았다 —
응답 본문의 error 가 MailSendError 로 승격되는지를 고정한다.
"""

import sys
import types

import pytest

from app.services.mail.base import MailSendError


def _install_fake_resend(monkeypatch, send_result):
    """진짜 resend 패키지 설치 여부와 무관하게 동작하도록 모듈을 통째로 바꿔 끼운다."""
    fake = types.ModuleType("resend")

    class Emails:
        @staticmethod
        def send(payload):
            if isinstance(send_result, Exception):
                raise send_result
            return send_result

    fake.Emails = Emails
    fake.api_key = None
    monkeypatch.setitem(sys.modules, "resend", fake)


def _sender(monkeypatch, send_result):
    _install_fake_resend(monkeypatch, send_result)
    from app.services.mail.resend_sender import ResendSender

    return ResendSender(api_key="key", from_email="from@example.com")


def test_an_error_dict_response_is_a_failure(monkeypatch):
    sender = _sender(monkeypatch, {"error": {"message": "domain not verified"}})

    with pytest.raises(MailSendError, match="domain not verified"):
        sender.send(["to@example.com"], "제목", "<p>본문</p>")


def test_a_success_dict_response_passes(monkeypatch):
    sender = _sender(monkeypatch, {"id": "email_123"})

    sender.send(["to@example.com"], "제목", "<p>본문</p>")


def test_a_none_response_passes(monkeypatch):
    """구버전 SDK 처럼 반환값이 없어도 예외가 없으면 성공으로 본다."""
    sender = _sender(monkeypatch, None)

    sender.send(["to@example.com"], "제목", "<p>본문</p>")


def test_an_exception_is_still_a_failure(monkeypatch):
    sender = _sender(monkeypatch, RuntimeError("connection reset"))

    with pytest.raises(MailSendError, match="connection reset"):
        sender.send(["to@example.com"], "제목", "<p>본문</p>")
