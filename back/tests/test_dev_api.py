"""dev 전용 API(/api/dev/*) — 권한 경계·기업 관리·체험 수명주기.

체험은 "유통기한 있는 샌드박스 기업"이다(기획 확정 7장). 발급 한 번에
기업+계정+샘플 데이터+소액 예산이 생기고, 만료되면 인증이 즉시 막고
정리 잡이 기업째 지운다 — 그 전체 수명주기를 여기서 고정한다.
"""

from datetime import date, datetime, timedelta, timezone

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
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.marketing_model import MarketingData
from app.models.rank_alert_log_model import RankAlertLog
from app.models.user_model import User
from app.routers import dev_router
from app.services import trial_service
from app.services.rank_monitor_service import compute_streak

_TABLES = [
    "companies", "users", "audit_logs", "ai_usage_budget", "ai_tool_usage_logs",
    "marketing_data", "marketing_period_meta", "report_log", "heading_suggestions",
    "image_edit_records",
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


def test_trial_sandbox_seeds_rank_watches_with_history(client, session_factory):
    """순위 화면이 비어 있으면 체험 손님이 핵심 가치를 보기도 전에 외부 수집을 눌러본다."""
    cid = client.post("/api/dev/trials", json={"days": 3}).json()["company_id"]

    db = session_factory()
    watches = db.query(KeywordWatch).filter_by(company_id=cid).all()
    assert len(watches) == len(trial_service._SAMPLE_RANK_WATCHES)

    snapshots = db.query(KeywordRankSnapshot).filter_by(company_id=cid).all()
    assert len(snapshots) == sum(
        len(ranks) for *_, ranks in trial_service._SAMPLE_RANK_WATCHES
    )
    # 스냅샷도 기업에 직접 귀속돼야 한다 — 격리·삭제가 전 테이블에서 같은 비교를 쓴다.
    assert {s.company_id for s in snapshots} == {cid}
    # 체험 기업에는 광고 계정이 없다 — 하지도 않은 자동 수집을 했다고 표시하면 안 된다.
    assert {s.source for s in snapshots} == {"upload"}
    # 전일까지만 — 실제 수집이 전일 확정치 기준이라, 오늘 자 행이 있으면 체험 화면만
    # 운영과 다른 모습이 된다.
    assert max(s.stat_date for s in snapshots) == date.today() - timedelta(days=1)
    db.close()


def test_trial_rank_sample_shows_one_detected_drop(client, session_factory):
    """예시의 요점은 "하락을 잡아 준다"다 — 전부 정상이면 보여줄 것이 없다."""
    cid = client.post("/api/dev/trials", json={"days": 3}).json()["company_id"]

    db = session_factory()
    watches = db.query(KeywordWatch).filter_by(company_id=cid).all()
    dropped = [w for w in watches if w.breach_streak >= w.breaches_required]

    assert len(dropped) == 1, "하락 예시가 정확히 하나여야 한다"
    # 이미 알린 것으로 두지 않으면, 체험 손님이 보고서를 한 번 올리는 순간 예시
    # 하락들이 한꺼번에 알림으로 나간다.
    assert dropped[0].alerted is True
    # 나머지는 깨끗해야 한다 — "전부 빨간 화면"은 제품이 고장난 것처럼 보이게 한다.
    assert len([w for w in watches if w.breach_streak == 0]) == len(watches) - 1
    db.close()


def test_trial_rank_sample_seeds_matching_alert_history(client, session_factory):
    """하락 표시만 있고 알림 이력이 비면 화면이 스스로 모순된다 — "연속 이탈 4회"와
    "2회에 도달하면 알림이 나갑니다"가 나란히 뜬다."""
    cid = client.post("/api/dev/trials", json={"days": 3}).json()["company_id"]

    db = session_factory()
    watches = {w.id: w for w in db.query(KeywordWatch).filter_by(company_id=cid).all()}
    logs = db.query(RankAlertLog).filter_by(company_id=cid).all()
    assert logs, "예시 하락에는 알림 기록이 따라와야 한다"
    # 하락만 보여주면 "알려는 주는데 끝난 건 모르는" 제품으로 읽힌다 — 회복까지 보여준다.
    assert {lg.alert_type for lg in logs} == {"drop", "recovered"}

    # 기록을 지어내지 않는다 — 남은 알림은 그 시점에 실제로 기준을 넘긴 것뿐이다.
    for log in logs:
        watch = watches[log.watch_id]
        assert log.target_rank == watch.target_rank
        assert log.recipients, "수신자가 비면 '누구한테 간 메일이지?'가 된다"
        if log.alert_type == "drop":
            assert log.breach_streak >= watch.breaches_required

    # 하락을 알린 뒤 회복하지 않은 감시만 alerted 로 남는다 — 이게 어긋나면 체험
    # 손님이 보고서를 올리는 순간 예시 하락이 알림으로 쏟아지거나, 반대로 영영 안 나간다.
    for watch in watches.values():
        mine = sorted(
            (lg for lg in logs if lg.watch_id == watch.id), key=lambda lg: lg.created_at
        )
        assert watch.alerted is (bool(mine) and mine[-1].alert_type == "drop"), watch.keyword
    db.close()


def test_trial_rank_streak_is_derived_from_history(client, session_factory):
    """숫자를 박아 두면 목표·허용값을 손볼 때 이력과 표시가 어긋난다 — 화면에서만 드러난다."""
    cid = client.post("/api/dev/trials", json={"days": 3}).json()["company_id"]

    db = session_factory()
    for watch in db.query(KeywordWatch).filter_by(company_id=cid).all():
        history = (
            db.query(KeywordRankSnapshot)
            .filter_by(watch_id=watch.id)
            .order_by(KeywordRankSnapshot.stat_date.desc())
            .all()
        )
        assert watch.breach_streak == compute_streak(watch, history)
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
    # 순위 예시도 함께 사라져야 한다 — 기업이 지워졌는데 감시·이력만 남으면 고아다.
    assert db.query(KeywordWatch).filter_by(company_id=cid).count() == 0
    assert db.query(KeywordRankSnapshot).filter_by(company_id=cid).count() == 0
    assert db.query(RankAlertLog).filter_by(company_id=cid).count() == 0
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
