"""/edit 응답 형태 — 신규(JSON 다건)와 구버전(단일 바이너리) 양쪽.

프런트(Vercel)와 백엔드(VM)는 따로 배포되고, 이미 열려 있는 탭은 옛 JS 를 그대로
쥐고 있다. 그 구간에 서버가 JSON 만 돌려주면 옛 클라이언트는 `res.blob()` 로 받아
**JSON 을 이미지라고 믿는 깨진 버전**을 만든다 — 오류조차 나지 않는다.

그래서 `count` 를 보내지 않으면 옛 응답 그대로 답한다. 프런트 배포가 끝나면 이
분기와 이 테스트를 함께 지운다.
"""

import base64
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.ai_budget import require_ai_budget
from app.core.rate_limit import limiter
from app.core.security import get_current_user, get_db
from app.models.system_setting_model import SystemSetting
from app.models.user_model import User
from app.routers import image_filter_router
from app.services.image_filter_service import EditResult, EditVariant

_PNG = b"\x89PNG-fake"


@pytest.fixture
def client(monkeypatch):
    async def fake_edit_variants(**kwargs):
        count = kwargs["count"]
        return (
            EditResult(
                variants=[
                    EditVariant(
                        image_base64=base64.b64encode(_PNG).decode("ascii"),
                        mime="image/jpeg",
                        filename=f"edited_{i + 1}.jpg",
                    )
                    for i in range(count)
                ],
                failed=0,
                provider="Gemini (test)",
            ),
            None,
        )

    monkeypatch.setattr(image_filter_router, "edit_variants", fake_edit_variants)
    monkeypatch.setattr(image_filter_router, "log_ai_usage", lambda **kwargs: None)
    # 이 파일의 관심사는 응답 형태(JSON vs 바이너리)다 — 결과 보관은
    # test_image_filter_history 가 검증하므로 여기선 꺼서 실제 스토리지 호출을 막는다.
    monkeypatch.setattr(image_filter_router, "_persist_edit_record", lambda *a, **k: None)

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SystemSetting.__table__.create(engine)  # 기능 플래그 조회용 (비어 있으면 허용)
    session = sessionmaker(bind=engine)()

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(image_filter_router.router)
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, email="user@example.com", role="member", company_id=1
    )
    app.dependency_overrides[require_ai_budget] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def _post(client, data: dict):
    return client.post(
        "/api/image-filter/edit",
        files={"file": ("img.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")},
        data=data,
    )


# ── 구버전 클라이언트 (count 미전송) ─────────────────────────────────────────

def test_without_count_the_response_is_a_single_binary_image(client):
    """옛 프런트는 res.blob() 으로 읽는다 — JSON 을 주면 깨진 이미지가 된다."""
    res = _post(client, {"prompt": "배경을 하얗게"})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/")
    assert res.content == _PNG


def test_without_count_the_old_headers_are_present(client):
    res = _post(client, {"prompt": "배경을 하얗게"})

    assert "attachment" in res.headers["content-disposition"]
    assert res.headers["X-AI-Provider"] == "Gemini (test)"


def test_without_count_only_one_image_is_generated(client, monkeypatch):
    """옛 동작은 1장이다 — 호환 경로가 조용히 4배 과금하면 안 된다."""
    seen = {}

    async def spy(**kwargs):
        seen["count"] = kwargs["count"]
        return (
            EditResult(
                variants=[EditVariant(
                    image_base64=base64.b64encode(_PNG).decode("ascii"),
                    mime="image/jpeg",
                    filename="edited_1.jpg",
                )],
                failed=0,
                provider="Gemini (test)",
            ),
            None,
        )

    monkeypatch.setattr(image_filter_router, "edit_variants", spy)
    _post(client, {"prompt": "배경을 하얗게"})

    assert seen["count"] == 1


# ── 신규 클라이언트 (count 전송) ─────────────────────────────────────────────

def test_with_count_the_response_is_json_with_that_many_variants(client):
    res = _post(client, {"prompt": "배경을 하얗게", "count": "4"})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    body = json.loads(res.content)
    assert len(body["variants"]) == 4
    assert body["provider"] == "Gemini (test)"


def test_count_above_the_cap_is_rejected(client):
    """상한은 화면이 아니라 서버가 막는다 — 요청을 직접 만들면 화면을 우회한다."""
    assert _post(client, {"prompt": "x", "count": "7"}).status_code == 422


def test_count_below_one_is_rejected(client):
    assert _post(client, {"prompt": "x", "count": "0"}).status_code == 422
