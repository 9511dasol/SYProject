"""체험(trial) 계정의 외부 발송 차단 + AI 예산 게이트의 기업 범위.

두 가지를 고정한다.

1. **체험 계정은 메일을 밖으로 보낼 수 없다** (기획 확정 7장 "남용 방지").
   테넌시 격리는 "누구 데이터를 보는가"만 다루므로, 수신자를 요청 본문에 임의로
   적을 수 있는 메일 발송은 격리로는 막히지 않는다. 체험 계정은 예비 고객에게
   그대로 넘기는 계정이라, 발신 도메인이 스팸 통로가 되는 길은 역할로 끊어야 한다.
   미리보기는 외부로 나가지 않으므로 체험도 쓸 수 있어야 한다 — 함께 막으면
   "맛보기"라는 체험의 목적 자체가 사라진다.

2. **AI 업스케일이 예산 게이트에 기업을 넘긴다.** check_ai_budget 은 멀티테넌시
   전환으로 (db, company_id) 가 됐는데 이 호출부만 db 하나로 남아, 업스케일 요청이
   예산 검사 대신 TypeError(500) 로 죽고 있었다. 예산 단위 테스트(test_ai_budget)는
   함수를 직접 부르므로 통과했고, 라우터를 거치는 테스트가 없어 기능이 죽은 채
   남아 있었다 — 그래서 여기서는 **HTTP 경로로** 확인한다.
"""

import io
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import get_current_user, get_db
from app.models.ai_tool_usage_log_model import AIToolUsageLog
from app.models.ai_usage_budget_model import AIUsageBudget
from app.models.company_model import Company
from app.models.user_model import User
from app.routers import image_resize_router, report_mail_router
from app.services.token_usage import TokenUsage

_TABLES = [
    "companies", "users", "system_settings",
    "ai_usage_budget", "ai_tool_usage_logs", "report_log",
]

TRIAL_COMPANY = 2


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    for name in _TABLES:
        Base.metadata.tables[name].create(engine)
    factory = sessionmaker(bind=engine)

    db = factory()
    db.add_all([
        Company(id=1, name="sy"),
        Company(id=TRIAL_COMPANY, name="체험-abc123", is_trial=True),
    ])
    db.add_all([
        User(id=1, email="admin@sy.com", hashed_password="x", role="admin", company_id=1),
        User(id=2, email="member@sy.com", hashed_password="x", role="member", company_id=1),
        User(
            id=3, email="trial-abc123@trial.syproject.kr", hashed_password="x",
            role="trial", company_id=TRIAL_COMPANY,
        ),
    ])
    db.commit()
    try:
        yield factory
    finally:
        db.close()
        engine.dispose()


class _ActingUser:
    def __init__(self, db):
        self.db = db
        self.user: User | None = None

    def act_as(self, user_id: int) -> None:
        self.user = self.db.query(User).filter(User.id == user_id).one()


@pytest.fixture
def actor(session_factory):
    return _ActingUser(session_factory())


@pytest.fixture
def client(session_factory, actor):
    app = FastAPI()
    app.include_router(report_mail_router.router)
    app.include_router(image_resize_router.router)

    db = session_factory()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: actor.user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        db.close()


_SEND_BODY = {
    "curr_year": 2026, "curr_month": 10,
    "prev_year": 2026, "prev_month": 9,
    "recipients": ["outsider@example.com"],
    "subject": "체험 계정이 보낸 메일",
}


# ── 1. 체험 계정의 외부 발송 차단 ─────────────────────────────────────────────


def test_trial_cannot_send_report_mail(client, actor, monkeypatch):
    """체험 계정의 비동기 발송은 403 — 오케스트레이터까지 가지도 않는다."""
    def _boom(*args, **kwargs):  # pragma: no cover - 호출되면 그 자체가 실패다
        raise AssertionError("체험 계정인데 발송 경로가 실행됐다")

    monkeypatch.setattr(report_mail_router, "build_orchestrator", _boom)

    actor.act_as(3)
    res = client.post("/api/report-mail/send", json=_SEND_BODY)

    assert res.status_code == 403
    assert "체험 계정" in res.json()["detail"]


def test_trial_cannot_send_report_mail_sync(client, actor):
    """동기 발송도 막힌다 (require_admin 과 별개로 발송 경로마다 명시)."""
    actor.act_as(3)
    res = client.post("/api/report-mail/send/sync", json=_SEND_BODY)
    assert res.status_code == 403


def test_trial_can_still_preview_report(client, actor, monkeypatch):
    """미리보기는 외부로 나가지 않으므로 체험도 쓸 수 있어야 한다."""
    monkeypatch.setattr(
        report_mail_router, "build_orchestrator",
        lambda *a, **kw: type("_O", (), {
            "preview": lambda self, **kwargs: {
                "subject": "미리보기", "comment": "코멘트", "html": "<p>본문</p>",
            },
        })(),
    )

    actor.act_as(3)
    res = client.post(
        "/api/report-mail/preview",
        json={"curr_year": 2026, "curr_month": 10, "prev_year": 2026, "prev_month": 9},
    )

    assert res.status_code == 200
    assert res.json()["subject"] == "미리보기"


def test_unknown_role_cannot_send_report_mail(client, actor, session_factory):
    """허용 목록에 없는 역할은 막힌다 — 가드가 fail-closed 임을 고정한다.

    차단 목록으로 짰다면 나중에 추가된 역할이 아무도 모르게 발송 권한을 얻는다.
    역할이 늘어날 때 security._OUTBOUND_ALLOWED_ROLES 를 반드시 거치게 하는 장치다.
    """
    db = session_factory()
    db.add(User(id=4, email="guest@sy.com", hashed_password="x", role="guest", company_id=1))
    db.commit()
    db.close()

    actor.act_as(4)
    res = client.post("/api/report-mail/send", json=_SEND_BODY)

    assert res.status_code == 403
    # 체험이 아니므로 "체험 계정" 문구가 아니라 일반 안내가 나가야 한다.
    assert "체험" not in res.json()["detail"]


def test_member_can_still_send_report_mail(client, actor, session_factory, monkeypatch):
    """차단은 체험에만 걸린다 — 일반 사원의 발송을 막으면 기능 회귀다."""
    sent: list[list[str]] = []
    monkeypatch.setattr(
        report_mail_router, "build_orchestrator",
        lambda *a, **kw: type("_O", (), {
            "run": lambda self, **kwargs: sent.append(kwargs["recipients"]),
        })(),
    )
    # 백그라운드 태스크가 자기 세션을 여는 경로를 테스트 DB 로 바꿔 둔다.
    monkeypatch.setattr(report_mail_router, "SessionLocal", session_factory)

    actor.act_as(2)
    res = client.post("/api/report-mail/send", json=_SEND_BODY)

    assert res.status_code == 200
    assert res.json()["status"] == "queued"
    assert sent == [["outsider@example.com"]]


# ── 2. AI 업스케일의 예산 게이트 ──────────────────────────────────────────────


def _png(width: int = 20, height: int = 20) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (10, 120, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _upload(use_ai_upscale: bool) -> dict:
    return {
        "files": {"file": ("in.png", _png(), "image/png")},
        "data": {"width": "40", "format": "png", "use_ai_upscale": str(use_ai_upscale).lower()},
    }


@pytest.fixture
def stub_resize(monkeypatch):
    """Gemini 호출과 사용량 기록을 대역으로 갈아 끼운다 (기록 kwargs 를 돌려준다).

    대역이 use_ai_upscale 을 **그대로 반영**하는 게 중요하다 — 늘 "AI 썼다"고
    답하면 순수 리사이즈 테스트가 실은 AI 경로를 보게 되어 아무것도 고정하지 못한다.
    """
    logged: list[dict] = []

    def _fake_resize(*, use_ai_upscale: bool, **kwargs):
        usage = TokenUsage.of(prompt=100, output=1290) if use_ai_upscale else None
        return io.BytesIO(b"resized"), "out.png", "image/png", use_ai_upscale, usage

    monkeypatch.setattr(image_resize_router, "resize_image", _fake_resize)
    monkeypatch.setattr(
        image_resize_router, "log_ai_usage", lambda **kwargs: logged.append(kwargs)
    )
    return logged


def test_ai_upscale_passes_company_to_budget_gate(client, actor, stub_resize):
    """업스케일 요청이 500 이 아니라 정상 통과하고, 사용량이 기업에 귀속된다.

    예산 미설정(0) 이면 통과가 정상 동작이다 — 고정하려는 것은 "예산 게이트가
    company_id 를 받아 호출된다"는 사실이므로, TypeError 로 죽지 않는 것이 핵심이다.
    """
    actor.act_as(3)  # 체험 계정도 업스케일 자체는 쓸 수 있다 (샌드박스 안의 기능)
    upload = _upload(use_ai_upscale=True)
    res = client.post("/api/image-resize/resize", **upload)

    assert res.status_code == 200
    assert res.headers["X-AI-Upscale-Used"] == "true"
    assert stub_resize[0]["company_id"] == TRIAL_COMPANY


def test_ai_upscale_blocked_when_company_budget_exhausted(
    client, actor, session_factory, stub_resize
):
    """예산을 다 쓴 기업의 업스케일은 429 — 합계도 예산도 그 기업 것만 본다."""
    db = session_factory()
    db.add(AIUsageBudget(company_id=TRIAL_COMPANY, monthly_token_budget=1_000))
    db.add(
        AIToolUsageLog(
            company_id=TRIAL_COMPANY, user_id=3, user_email="trial-abc123@trial.syproject.kr",
            tool="image_resize", image_filename="earlier.png", total_tokens=1_500,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.close()

    actor.act_as(3)
    res = client.post("/api/image-resize/resize", **_upload(use_ai_upscale=True))

    assert res.status_code == 429
    assert stub_resize == []  # 예산 초과면 Gemini 호출까지 가지 않는다


def test_plain_resize_ignores_budget(client, actor, session_factory, stub_resize):
    """순수 Pillow 리사이즈는 과금이 없으므로 예산을 다 써도 계속 쓸 수 있다."""
    db = session_factory()
    db.add(AIUsageBudget(company_id=TRIAL_COMPANY, monthly_token_budget=1))
    db.add(
        AIToolUsageLog(
            company_id=TRIAL_COMPANY, user_id=3, user_email="trial-abc123@trial.syproject.kr",
            tool="image_resize", image_filename="earlier.png", total_tokens=9_999,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.close()

    actor.act_as(3)
    res = client.post("/api/image-resize/resize", **_upload(use_ai_upscale=False))

    assert res.status_code == 200
    assert res.headers["X-AI-Upscale-Used"] == "false"
    assert stub_resize == []  # AI 를 쓰지 않았으니 사용량도 기록되지 않는다
