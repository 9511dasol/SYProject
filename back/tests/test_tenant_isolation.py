"""크로스 테넌트 격리 — "A기업 계정으로 B기업 데이터는 절대 보이지 않는다"를 고정한다.

멀티테넌시의 1번 약속이다. 여기서 깨지면 기능 버그가 아니라 데이터 유출 사고이므로,
이 테스트는 새 기능이 격리를 조용히 깨뜨리지 않는지 상시 감시하는 회귀 장벽이다.

검증 원칙
  - 조회는 "자기 기업 것만" 나온다.
  - 타기업 단건 리소스는 403이 아니라 **404** — 존재한다는 사실도 노출하지 않는다.
  - 되돌리기(undo)·백그라운드 작업처럼 uuid 를 아는 것만으로도 접근할 수 있던
    경로까지 포함한다.
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
from app.core.tenant import TenantContext, get_tenant_context
from app.models.audit_log_model import AuditLog
from app.models.company_model import Company
from app.models.keyword_watch_model import KeywordWatch
from app.models.marketing_model import MarketingData
from app.models.report_log_model import ReportLog
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.repositories.ai_usage_budget_repo import AIUsageBudgetRepository
from app.repositories.keyword_watch_repo import KeywordWatchRepository
from app.repositories.report_log_repo import ReportLogRepository
from app.repositories.user_repo import UserRepository
from app.routers import marketing_router, user_admin_router
from app.services import task_store

_TABLES = [
    "companies", "users", "marketing_data", "marketing_period_meta",
    "undo_snapshots", "background_tasks", "keyword_watch", "keyword_rank_snapshot",
    "rank_alert_log", "report_log", "ai_tool_usage_logs", "ai_usage_budget",
    "audit_logs",
]


@pytest.fixture
def session_factory(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    for name in _TABLES:
        Base.metadata.tables[name].create(engine)
    factory = sessionmaker(bind=engine)

    # SessionLocal()/engine 을 직접 여는 경로(marketing_router·task_store·marketing_repo)에
    # 전부 같은 테스트 DB 를 꽂는다.
    from app.repositories import marketing_repo as repo_module

    monkeypatch.setattr(marketing_router, "SessionLocal", factory)
    monkeypatch.setattr(task_store, "SessionLocal", factory)
    monkeypatch.setattr(repo_module, "SessionLocal", factory)
    monkeypatch.setattr(repo_module, "engine", engine)
    # DELETE /rows 는 함수 안에서 app.core.database.engine 을 직접 임포트한다
    monkeypatch.setattr("app.core.database.engine", engine)

    db = factory()
    db.add_all([
        Company(id=1, name="sy"),
        Company(id=2, name="b-corp"),
    ])
    db.add_all([
        User(id=1, email="admin-a@a.com", hashed_password="x", role="admin", company_id=1),
        User(id=2, email="member-a@a.com", hashed_password="x", role="member", company_id=1),
        User(id=3, email="admin-b@b.com", hashed_password="x", role="admin", company_id=2),
    ])
    db.add_all([
        MarketingData(
            company_id=cid, report_date=date(2026, 10, 1), campaign_type="네이버",
            impressions=1000 * cid, clicks=100, cost=10_000.0, conversions=0,
            conversion_revenue=50_000.0, signup=0.0, purchase=0.0, apply=0.0,
        )
        for cid in (1, 2)
    ])
    db.commit()
    try:
        yield factory
    finally:
        db.close()
        engine.dispose()


class _ActingUser:
    """요청마다 다른 사용자로 행동하기 위한 전환 가능한 홀더."""

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
    app.include_router(marketing_router.router)
    app.include_router(user_admin_router.router)

    db = session_factory()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: actor.user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        db.close()


# ── 마케팅 데이터 ─────────────────────────────────────────────────────────────


def test_marketing_summary_shows_only_own_company(client, actor):
    actor.act_as(2)  # A기업 사원
    total = client.get("/api/marketing/summary?year=2026&month=10").json()["total"]
    assert total["impressions"] == 1000  # B기업(2000)이 섞이면 3000이 된다

    actor.act_as(3)  # B기업 admin
    total = client.get("/api/marketing/summary?year=2026&month=10").json()["total"]
    assert total["impressions"] == 2000


def test_deleting_another_companys_row_is_404(client, actor, session_factory):
    actor.act_as(2)  # A기업 — B기업 행과 같은 (날짜, 매체)를 지정해도 B 행은 안 지워진다
    # A 행을 먼저 지우면, 같은 키의 두 번째 시도는 "없음"이어야 한다
    assert client.delete(
        "/api/marketing/rows?report_date=2026-10-01&campaign_type=네이버"
    ).status_code == 200
    assert client.delete(
        "/api/marketing/rows?report_date=2026-10-01&campaign_type=네이버"
    ).status_code == 404

    db = session_factory()
    remaining = db.query(MarketingData).all()
    db.close()
    assert len(remaining) == 1 and remaining[0].company_id == 2  # B 행은 그대로


def test_undo_from_another_company_is_404(client, actor, session_factory):
    from app.repositories.undo_snapshot_repo import UndoSnapshotRepository

    db = session_factory()
    UndoSnapshotRepository(db).create("b-undo", [{"a": 1}], company_id=2)
    db.commit()
    db.close()

    actor.act_as(1)  # A기업 admin 이 B기업의 undo_id 를 알아내도
    assert client.post("/api/marketing/undo/b-undo").status_code == 404


# ── 백그라운드 작업 ───────────────────────────────────────────────────────────


def test_polling_another_companys_task_is_404(client, actor):
    task_id = task_store.create_task("marketing_export", user_id=3, company_id=2)

    actor.act_as(1)
    assert client.get(f"/api/marketing/export-db-task/{task_id}").status_code == 404
    assert client.delete(f"/api/marketing/export-db-task/{task_id}").status_code == 404

    actor.act_as(3)
    assert client.get(f"/api/marketing/export-db-task/{task_id}").status_code == 200


# ── 계정 관리 ─────────────────────────────────────────────────────────────────


def test_admin_sees_only_own_company_users(client, actor):
    actor.act_as(1)  # A기업 admin
    emails = {u["email"] for u in client.get("/api/admin/users").json()}
    assert emails == {"admin-a@a.com", "member-a@a.com"}


def test_admin_cannot_touch_another_companys_user(client, actor):
    actor.act_as(1)
    r = client.patch("/api/admin/users/3/role", json={"role": "member"})
    assert r.status_code == 404  # B기업 admin 계정은 "없는 것"


def test_db_blocks_second_admin_in_a_company(client, actor):
    actor.act_as(1)
    r = client.patch("/api/admin/users/2/role", json={"role": "admin"})
    assert r.status_code == 409  # partial unique index — 기업당 admin 1


# ── 리포 단위 (HTTP 를 안 거치는 경로) ────────────────────────────────────────


def test_keyword_watch_repo_scopes_get_and_list(session_factory):
    db = session_factory()
    db.add(KeywordWatch(id=10, company_id=2, keyword="키워드", device="all"))
    db.commit()

    repo_a = KeywordWatchRepository(db, company_id=1)
    assert repo_a.get(10) is None       # 타기업 감시는 "없는 것"
    assert repo_a.list_all() == []

    assert KeywordWatchRepository(db, company_id=2).get(10) is not None
    db.close()


def test_report_log_repo_scopes_get_and_list(session_factory):
    db = session_factory()
    db.add(ReportLog(id=10, company_id=2, curr_year=2026, curr_month=10,
                     prev_year=2026, prev_month=9))
    db.commit()

    assert ReportLogRepository(db, 1).get(10) is None
    assert ReportLogRepository(db, 1).list_logs() == []
    assert ReportLogRepository(db, 2).get(10) is not None
    db.close()


def test_ai_budget_is_per_company(session_factory):
    db = session_factory()
    AIUsageBudgetRepository(db).set(1, 5000)
    assert AIUsageBudgetRepository(db).get(1) == 5000
    assert AIUsageBudgetRepository(db).get(2) == 0  # B기업은 영향 없음

    log_repo = AIToolUsageLogRepository(db)
    log_repo.create(
        user=db.get(User, 1), company_id=1, tool="heading_suggest",
        image_filename="a.png", total_tokens=100,
    )
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    assert log_repo.sum_tokens_since(since, company_id=1) == 100
    assert log_repo.sum_tokens_since(since, company_id=2) == 0
    db.close()


def test_user_repo_scopes_company_lookup(session_factory):
    db = session_factory()
    repo = UserRepository(db)
    assert repo.get_by_id_in_company(3, company_id=1) is None
    assert {u.email for u in repo.list_by_company(2)} == {"admin-b@b.com"}
    db.close()


# ── 기업 상태(정지·체험 만료)와 dev 열람 감사 ────────────────────────────────


def test_inactive_company_blocks_access(session_factory):
    db = session_factory()
    db.add(Company(id=3, name="stopped", is_active=False))
    db.add(User(id=9, email="s@s.com", hashed_password="x", role="member", company_id=3))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        ensure_company_access(db, db.get(User, 9))
    assert exc.value.status_code == 401
    db.close()


def test_expired_trial_blocks_access(session_factory):
    db = session_factory()
    db.add(Company(
        id=4, name="trial", is_trial=True,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    ))
    db.add(User(id=8, email="t@t.com", hashed_password="x", role="trial", company_id=4))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        ensure_company_access(db, db.get(User, 8))
    assert exc.value.status_code == 401
    assert "체험" in exc.value.detail
    db.close()


def test_dev_view_is_audited(session_factory):
    db = session_factory()
    # ORM 은 None 을 "값 없음"으로 보고 INSERT 에서 생략해 server_default(sy)가 끼어든다 —
    # 운영의 승격 스크립트처럼 UPDATE 로 무소속을 만든다.
    dev = User(id=7, email="dev@dev.com", hashed_password="x", role="member", company_id=1)
    db.add(dev)
    db.commit()
    dev.role = "dev"
    dev.company_id = None
    db.commit()

    ctx = get_tenant_context(current_user=dev, db=db, x_company_id="2")
    assert isinstance(ctx, TenantContext) and ctx.company_id == 2

    audit = db.query(AuditLog).filter(AuditLog.action == "data.view_as_dev").one()
    assert audit.company_id == 2 and audit.actor_user_id == 7
    db.close()


def test_non_dev_cannot_switch_company_via_header(session_factory):
    db = session_factory()
    member = db.get(User, 2)  # A기업 사원
    ctx = get_tenant_context(current_user=member, db=db, x_company_id="2")
    # 헤더는 무시되고 자기 기업으로 고정된다 — 헤더로 남의 기업을 가리킬 수 없다.
    assert ctx.company_id == 1
    db.close()
