"""리포트 발송 로그 조회 · 실패 건 재발송.

발송은 백그라운드로 이뤄져 실패해도 요청자가 알기 어려웠고, ReportLog에 기록만
쌓일 뿐 볼 화면이 없었다. 재발송은 원래 실패 기록을 고쳐 쓰지 않고 새 시도로
남아야 한다 — 언제 무엇이 실패했는지가 이력에서 사라지면 안 되기 때문이다.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_db, require_admin
from app.models.report_log_model import ReportLog
from app.models.user_model import User
from app.repositories.report_log_repo import ReportLogRepository
from app.routers import admin_report_log_router


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    ReportLog.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _add_log(db, *, status: str, minutes_ago: int = 0, recipients: str = "a@example.com") -> ReportLog:
    log = ReportLog(
        curr_year=2026, curr_month=6, prev_year=2026, prev_month=5,
        recipients=recipients,
        subject="[마케팅 리포트] 2026년 6월 성과 요약",
        status=status,
        error_msg="SMTP 연결 실패" if status == "error" else None,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    )
    db.add(log)
    db.commit()
    return log


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(admin_report_log_router.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[require_admin] = lambda: User(id=1, email="admin@example.com", role="admin")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


# ── 리포지토리 ────────────────────────────────────────────────────────────────


def test_list_returns_newest_first(db):
    _add_log(db, status="sent", minutes_ago=30)
    newest = _add_log(db, status="error", minutes_ago=1)

    assert ReportLogRepository(db).list_logs()[0].id == newest.id


def test_status_filter(db):
    _add_log(db, status="sent")
    _add_log(db, status="error")

    repo = ReportLogRepository(db)
    assert repo.count(status="error") == 1
    assert [r.status for r in repo.list_logs(status="error")] == ["error"]


def test_count_by_status(db):
    _add_log(db, status="sent")
    _add_log(db, status="sent")
    _add_log(db, status="error")

    assert ReportLogRepository(db).count_by_status() == {"sent": 2, "error": 1}


# ── 조회 엔드포인트 ───────────────────────────────────────────────────────────


def test_list_endpoint_returns_items_and_counts(client, db):
    _add_log(db, status="sent")
    _add_log(db, status="error")

    body = client.get("/api/admin/report-logs").json()
    assert body["total"] == 2
    assert body["counts"] == {"sent": 1, "error": 1}
    assert len(body["items"]) == 2


def test_list_endpoint_filters_by_status(client, db):
    _add_log(db, status="sent")
    _add_log(db, status="error")

    body = client.get("/api/admin/report-logs?status=error").json()
    assert body["total"] == 1
    assert body["items"][0]["error_msg"] == "SMTP 연결 실패"
    # counts는 필터와 무관하게 전체를 센다 (상단 요약용)
    assert body["counts"] == {"sent": 1, "error": 1}


# ── 재발송 ────────────────────────────────────────────────────────────────────


def test_resend_unknown_log_returns_404(client):
    assert client.post("/api/admin/report-logs/999/resend").status_code == 404


def test_resend_without_recipients_rejected(client, db):
    log = _add_log(db, status="error", recipients="")
    response = client.post(f"/api/admin/report-logs/{log.id}/resend")
    assert response.status_code == 400
    assert "수신자" in response.json()["detail"]


def test_resend_blocked_when_mail_disabled(client, db, monkeypatch):
    from app.core.settings import settings

    monkeypatch.setattr(settings, "MAIL_ENABLED", False)
    log = _add_log(db, status="error")

    response = client.post(f"/api/admin/report-logs/{log.id}/resend")
    assert response.status_code == 400
    assert "MAIL_ENABLED" in response.json()["detail"]


def test_resend_keeps_original_failure_record(client, db, mocker):
    """재발송에 성공해도 원래 실패 기록은 그대로 남아야 한다."""
    failed = _add_log(db, status="error", recipients="a@example.com, b@example.com")

    def fake_run(**kwargs):
        # 실제 orchestrator처럼 새 로그를 남긴다
        db.add(ReportLog(
            curr_year=kwargs["curr_year"], curr_month=kwargs["curr_month"],
            prev_year=kwargs["prev_year"], prev_month=kwargs["prev_month"],
            recipients=", ".join(kwargs["recipients"]),
            subject=kwargs["subject"], status="sent",
        ))
        db.commit()
        return {"status": "sent", "recipients": kwargs["recipients"]}

    mocker.patch.object(
        admin_report_log_router, "build_orchestrator",
        return_value=mocker.Mock(run=mocker.Mock(side_effect=fake_run)),
    )

    response = client.post(f"/api/admin/report-logs/{failed.id}/resend")
    assert response.status_code == 200
    assert response.json()["recipients"] == ["a@example.com", "b@example.com"]

    repo = ReportLogRepository(db)
    assert repo.get(failed.id).status == "error"  # 원본 보존
    assert repo.count_by_status() == {"sent": 1, "error": 1}


def test_resend_failure_returns_502(client, db, mocker):
    log = _add_log(db, status="error")
    mocker.patch.object(
        admin_report_log_router, "build_orchestrator",
        return_value=mocker.Mock(run=mocker.Mock(side_effect=RuntimeError("SMTP 인증 실패"))),
    )

    response = client.post(f"/api/admin/report-logs/{log.id}/resend")
    assert response.status_code == 502
    assert "SMTP 인증 실패" in response.json()["detail"]
