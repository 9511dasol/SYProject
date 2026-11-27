"""Gemini 이미지 생성 — 안전 정책 거부 응답 처리.

거부되면 후보는 있는데 `content` 가 None 으로 온다(finish_reason=IMAGE_SAFETY 등 —
저작권 캐릭터 이미지에서 실제로 겪음, 2026-11-28). 예전에는 이 접근이 try 밖이라
AttributeError 가 그대로 올라가 라우터의 일반 422("이미지 처리 중 오류")로
둔갑했다. 거부는 실패의 한 형태일 뿐이므로 다른 실패와 같은 None 계약을 따라야
하고, 원인은 서버 로그에 남아야 한다.
"""

from unittest.mock import MagicMock, patch

from app.services import image_ai_edit_service as svc


def _client_returning(resp) -> MagicMock:
    client = MagicMock()
    client.models.generate_content.return_value = resp
    return client


def test_safety_refused_candidate_returns_none_instead_of_crashing():
    resp = MagicMock()
    refused = MagicMock()
    refused.content = None
    refused.finish_reason = "IMAGE_SAFETY"
    resp.candidates = [refused]

    with patch.object(svc, "_gemini", return_value=_client_returning(resp)):
        assert svc.generate_image(b"img", "캐릭터를 바꿔줘") is None


def test_refusal_reason_is_logged_for_operators(caplog):
    """운영자가 로그만 보고 '거부인지 장애인지'를 구분할 수 있어야 한다."""
    resp = MagicMock()
    refused = MagicMock()
    refused.content = None
    refused.finish_reason = "IMAGE_SAFETY"
    resp.candidates = [refused]

    with patch.object(svc, "_gemini", return_value=_client_returning(resp)):
        with caplog.at_level("WARNING"):
            svc.generate_image(b"img", "p")

    assert "IMAGE_SAFETY" in caplog.text
