"""dev 전용 API(/api/dev/*) — 권한 경계·기업 관리·체험 수명주기.

체험은 "유통기한 있는 샌드박스 기업"이다(기획 확정 7장). 발급 한 번에
기업+계정+샘플 데이터+소액 예산이 생기고, 만료되면 인증이 즉시 막고
정리 잡이 기업째 지운다 — 그 전체 수명주기를 여기서 고정한다.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import ensure_company_access, get_current_user, get_db
from app.core.settings import settings
from app.models.ai_usage_budget_model import AIUsageBudget
from app.models.audit_log_model import AuditLog
from app.models.company_model import Company
from app.models.marketing_model import MarketingData
from app.models.user_model import User
from app.routers import dev_router
from app.services import trial_service

_TABLES = [
    "companies", "users", "audit_logs", "ai_usage_budget", "ai_tool_usage_logs",
    "marketing_data", "marketing_period_meta", "report_log", "heading_suggestions",
    "keyword_watch", "keyword_rank_snapshot", "rank_alert_log", "undo_snapshots",
    "background_tasks", "document_embedding",
]


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    for name in _TABLES:
        Base.metadata.tables[name].create(engine)
    factory = sessionmaker(bind=engine)

    db = factory()
    db.add(Company(id=1, name="sy"))
    db.add(User(id=1, email="admin@sy.com", hashed_password="x", role="admin", company_id=1))
    db.commit()
    # dev 는 무소속 — ORM 이 None 을 생략해 server_default 가 끼므로 UPDATE 로 만든다.
    dev = User(id=99, email="dev@sy.com", hashed_password="x", role="member", company_id=1)
    db.add(dev)
    db.commit()
    dev.role, dev.company_id = "dev", None
    db.commit()
    try:
        yield factory
    finally:
        db.close()
        engine.dispose()


class _Actor:
    def __init__(self, db):
        self.db = db
        self.user = db.get(User, 99)  # 기본: dev

    def act_as(self, user_id: int) -> None:
        self.user = self.db.get(User, user_id)


@pytest.fixture
def actor(session_factory):
    return _Actor(session_factory())


@pytest.fixture
def client(session_factory, actor):
    app = FastAPI()
    app.include_router(dev_router.router)
    db = session_factory()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: actor.user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        db.close()


# ── 권한 경계 ─────────────────────────────────────────────────────────────────


def test_non_dev_gets_403(client, actor):
    actor.act_as(1)  # 기업 admin — dev 화면은 금지다
    assert client.get("/api/dev/companies").status_code == 403
    assert client.post("/api/dev/companies", json={"name": "x"}).status_code == 403


# ── 기업 관리 ─────────────────────────────────────────────────────────────────


def test_company_create_and_list_with_stats(client, session_factory):
    assert client.post("/api/dev/companies", json={"name": "b-corp"}).status_code == 201
    # 같은 이름은 409
    assert client.post("/api/dev/companies", json={"name": "b-corp"}).status_code == 409

    body = client.get("/api/dev/companies").json()
    names = {c["name"]: c for c in body["items"]}
    assert set(names) == {"sy", "b-corp"}
    assert names["sy"]["user_count"] == 1  # dev(무소속)는 어느 기업에도 안 센다
    assert names["sy"]["admin_email"] == "admin@sy.com"


def test_company_suspend_blocks_members_immediately(client, session_factory):
    r = client.patch("/api/dev/companies/1/active", json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False

    db = session_factory()
    with pytest.raises(HTTPException):
        ensure_company_access(db, db.get(User, 1))  # sy admin 이 즉시 차단된다
    db.close()


def test_real_company_cannot_be_deleted(client):
    assert client.delete("/api/dev/companies/1").status_code == 400


def test_budget_set_is_per_company_and_audited(client, session_factory):
    r = client.patch("/api/dev/companies/1/budget", json={"monthly_token_budget": 123_000})
    assert r.status_code == 200 and r.json()["monthly_token_budget"] == 123_000

    db = session_factory()
    assert db.query(AIUsageBudget).filter_by(company_id=1).one().monthly_token_budget == 123_000
    assert db.query(AuditLog).filter_by(action="budget.set").count() == 1
    db.close()


def test_admin_issue_respects_one_admin_per_company(client):
    # sy 에는 이미 admin 이 있다 — DB partial unique 가 409 로 번역된다
    r = client.post(
        "/api/dev/companies/1/admin",
        json={"email": "second@sy.com", "password": "longenough1"},
    )
    assert r.status_code == 409

    client.post("/api/dev/companies", json={"name": "b-corp"})
    r = client.post(
        "/api/dev/companies/2/admin",
        json={"email": "admin@b.com", "password": "longenough1"},
    )
    assert r.status_code == 201 and r.json()["role"] == "admin"


# ── 계정 관리 ─────────────────────────────────────────────────────────────────


def test_dev_user_crud_and_dev_account_is_off_limits(client, session_factory):
    r = client.post("/api/dev/users", json={
        "company_id": 1, "email": "m@sy.com", "password": "longenough1", "role": "member",
    })
    assert r.status_code == 201
    user_id = r.json()["id"]

    assert client.patch(f"/api/dev/users/{user_id}/active", json={"is_active": False}).status_code == 200
    assert client.patch(f"/api/dev/users/{user_id}/unlock").status_code == 200
    assert client.delete(f"/api/dev/users/{user_id}").status_code == 200

    # dev 계정(99)은 이 화면에서 만질 수 없다 — 강등·삭제 전부 403
    assert client.patch("/api/dev/users/99/role", json={"role": "member"}).status_code == 403
    assert client.delete("/api/dev/users/99").status_code == 403

    db = session_factory()
    actions = {a.action for a in db.query(AuditLog).all()}
    assert {"user.create", "user.active_change", "user.unlock", "user.delete"} <= actions
    db.close()


# ── 체험 수명주기 ─────────────────────────────────────────────────────────────


def test_trial_issue_creates_sandbox_with_seed_and_budget(client, session_factory):
    r = client.post("/api/dev/trials", json={"days": 3})
    assert r.status_code == 201
    body = r.json()
    assert body["password"]  # 초기 비번은 발급 응답에서 한 번 노출
    cid = body["company_id"]

    # 자동 생성 이메일이 로그인 스키마(EmailStr)를 통과해야 한다 — .local/.test 같은
    # 특수용 도메인이면 발급은 되는데 로그인이 안 되는 계정이 된다 (실기동에서 발견).
    from pydantic import TypeAdapter
    from pydantic import EmailStr as _EmailStr

    TypeAdapter(_EmailStr).validate_python(body["email"])

    db = session_factory()
    company = db.get(Company, cid)
    assert company.is_trial and company.expires_at is not None
    # 샘플 데이터·소액 예산·trial 계정이 함께 생겼다
    assert db.query(MarketingData).filter_by(company_id=cid).count() > 0
    assert (
        db.query(AIUsageBudget).filter_by(company_id=cid).one().monthly_token_budget
        == settings.TRIAL_TOKEN_BUDGET
    )
    trial_user = db.query(User).filter_by(company_id=cid).one()
    assert trial_user.role == "trial"
    db.close()


def test_expired_trial_is_blocked_then_purged(client, session_factory):
    cid = client.post("/api/dev/trials", json={"days": 1}).json()["company_id"]

    db = session_factory()
    company = db.get(Company, cid)
    company.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()

    # 1차 방어 — 정리 잡 전에도 인증이 즉시 막는다
    trial_user = db.query(User).filter_by(company_id=cid).one()
    with pytest.raises(HTTPException) as exc:
        ensure_company_access(db, trial_user)
    assert "체험" in exc.value.detail

    # 2차 방어 — 정리 잡이 기업째 지운다 (샘플 데이터·계정·예산 포함)
    assert trial_service.purge_expired_trials(db) == 1
    assert db.get(Company, cid) is None
    assert db.query(User).filter_by(company_id=cid).count() == 0
    assert db.query(MarketingData).filter_by(company_id=cid).count() == 0
    assert db.query(AIUsageBudget).filter_by(company_id=cid).count() == 0
    db.close()


def test_trial_extend_moves_expiry_forward(client, session_factory):
    cid = client.post("/api/dev/trials", json={"days": 1}).json()["company_id"]
    r = client.patch(f"/api/dev/trials/{cid}", json={"days": 7})
    assert r.status_code == 200

    db = session_factory()
    expires = db.get(Company, cid).expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    assert expires > datetime.now(timezone.utc) + timedelta(days=6)
    db.close()


def test_trial_delete_is_immediate(client, session_factory):
    cid = client.post("/api/dev/trials", json={"days": 3}).json()["company_id"]
    assert client.delete(f"/api/dev/companies/{cid}").status_code == 200

    db = session_factory()
    assert db.get(Company, cid) is None
    assert db.query(MarketingData).filter_by(company_id=cid).count() == 0
    db.close()


def test_cascade_covers_every_tenant_model():
    """새 테넌트 모델이 생겼는데 삭제 목록에 안 넣으면 고아 데이터가 남는다 — 여기서 잡는다."""
    tenant_tables = {
        t.name
        for t in Base.metadata.tables.values()
        if "company_id" in t.columns and t.name not in ("users", "audit_logs")
    }
    cascade_tables = {m.__tablename__ for m in trial_service._TENANT_MODELS}
    assert cascade_tables == tenant_tables


# ── 감사 로그 조회 ────────────────────────────────────────────────────────────


def test_audit_log_listing_and_filters(client):
    client.post("/api/dev/companies", json={"name": "b-corp"})
    client.post("/api/dev/trials", json={"days": 2})

    body = client.get("/api/dev/audit-logs").json()
    assert body["total"] >= 2
    actions = {item["action"] for item in body["items"]}
    assert {"company.create", "trial.create"} <= actions

    only_create = client.get("/api/dev/audit-logs?action=company.create").json()
    assert all(i["action"] == "company.create" for i in only_create["items"])
