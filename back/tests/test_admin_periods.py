"""업로드된 마케팅 데이터의 연월별 조회·삭제.

지금까지 잘못 올린 데이터를 지우려면 DB를 직접 만지는 수밖에 없었다.
데이터 행은 지웠지만 코멘트만 남은 연월도 목록에 나와야 정리할 수 있다.
"""

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_db, require_admin
from app.models.marketing_model import MarketingData, MarketingPeriodMeta
from app.models.user_model import User
from app.repositories.marketing_repo import MarketingRepository
from app.routers import admin_period_router


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    MarketingData.__table__.create(engine)
    MarketingPeriodMeta.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _add_row(db, year: int, month: int, day: int, campaign_type: str = "네이버") -> None:
    db.add(MarketingData(
        report_date=date(year, month, day), campaign_type=campaign_type,
        impressions=100, clicks=10, cost=1000.0,
        conversions=1, conversion_revenue=5000.0, signup=0.0, purchase=1.0, apply=0.0,
    ))
    db.commit()


def _add_meta(db, year: int, month: int, *, comment: str = "", excel_path: str | None = None) -> None:
    db.add(MarketingPeriodMeta(year=year, month=month, comment=comment, excel_path=excel_path))
    db.commit()


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(admin_period_router.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[require_admin] = lambda: User(id=1, email="admin@example.com", role="admin")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


# ── 목록 ──────────────────────────────────────────────────────────────────────


def test_overview_aggregates_rows_per_period(db):
    _add_row(db, 2026, 6, 1)
    _add_row(db, 2026, 6, 2)
    _add_row(db, 2026, 5, 10)

    items = MarketingRepository(db).list_period_overview()
    june = next(i for i in items if i["month"] == 6)
    assert june["row_count"] == 2
    assert june["first_date"] == "2026-06-01"
    assert june["last_date"] == "2026-06-02"


def test_overview_is_newest_first(db):
    _add_row(db, 2025, 12, 1)
    _add_row(db, 2026, 6, 1)

    items = MarketingRepository(db).list_period_overview()
    assert [(i["year"], i["month"]) for i in items] == [(2026, 6), (2025, 12)]


def test_overview_includes_period_with_meta_only(db):
    """데이터 행 없이 코멘트만 남은 기간도 보여야 정리할 수 있다."""
    _add_meta(db, 2026, 3, comment="지난달 대비 CPC 상승")

    items = MarketingRepository(db).list_period_overview()
    assert len(items) == 1
    assert items[0]["row_count"] == 0
    assert items[0]["has_comment"] is True


def test_overview_flags_comment_and_excel(db):
    _add_row(db, 2026, 6, 1)
    _add_meta(db, 2026, 6, comment="코멘트", excel_path="2026/06/report.xlsx")

    item = MarketingRepository(db).list_period_overview()[0]
    assert item["has_comment"] is True
    assert item["has_excel"] is True


def test_empty_comment_is_not_counted_as_having_one(db):
    _add_row(db, 2026, 6, 1)
    _add_meta(db, 2026, 6, comment="")

    assert MarketingRepository(db).list_period_overview()[0]["has_comment"] is False


def test_list_endpoint_returns_total_rows(client, db):
    _add_row(db, 2026, 6, 1)
    _add_row(db, 2026, 5, 1)

    body = client.get("/api/admin/periods").json()
    assert body["total_rows"] == 2
    assert len(body["items"]) == 2


# ── 삭제 ──────────────────────────────────────────────────────────────────────


def test_delete_removes_rows_and_meta(client, db, mocker):
    mocker.patch("app.repositories.marketing_repo.storage_service.delete_object")
    _add_row(db, 2026, 6, 1)
    _add_row(db, 2026, 6, 2)
    _add_meta(db, 2026, 6, comment="코멘트", excel_path="2026/06/report.xlsx")

    body = client.delete("/api/admin/periods/2026/6").json()
    assert body["deleted_rows"] == 2
    assert body["deleted_meta"] is True
    assert body["deleted_excel"] is True
    assert MarketingRepository(db).list_period_overview() == []


def test_delete_leaves_other_periods_untouched(client, db):
    _add_row(db, 2026, 6, 1)
    _add_row(db, 2026, 5, 1)

    client.delete("/api/admin/periods/2026/6")

    remaining = MarketingRepository(db).list_period_overview()
    assert [(i["year"], i["month"]) for i in remaining] == [(2026, 5)]


def test_delete_unknown_period_returns_404(client, db):
    _add_row(db, 2026, 6, 1)
    assert client.delete("/api/admin/periods/2026/1").status_code == 404


def test_delete_rejects_invalid_month(client):
    assert client.delete("/api/admin/periods/2026/13").status_code == 422


def test_storage_failure_still_deletes_db_rows(client, db, mocker):
    """스토리지 삭제가 실패해도 DB는 정리돼야 한다 — 아니면 화면에서 지울 방법이 사라진다."""
    mocker.patch(
        "app.repositories.marketing_repo.storage_service.delete_object",
        side_effect=RuntimeError("storage down"),
    )
    _add_row(db, 2026, 6, 1)
    _add_meta(db, 2026, 6, excel_path="2026/06/report.xlsx")

    body = client.delete("/api/admin/periods/2026/6").json()
    assert body["deleted_rows"] == 1
    assert body["deleted_excel"] is False  # 고아 객체로 남았음을 응답에 드러낸다
    assert MarketingRepository(db).list_period_overview() == []
