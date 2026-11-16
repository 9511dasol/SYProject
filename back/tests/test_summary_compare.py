"""/api/marketing/summary 의 기간 비교 블록(MoM·YoY).

월간 리뷰 화면이 당월 리포트와 함께 전월·전년동월 합계를 받아 증감을 보여준다.
비교 달 데이터가 DB에 없으면 블록이 None 으로 와야 한다 — 0 으로 오면 화면이
"전부 -100%" 라는 거짓 증감을 그리게 된다.
"""

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_current_user
from app.models.marketing_model import MarketingData, MarketingPeriodMeta
from app.models.user_model import User
from app.routers import marketing_router


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    MarketingData.__table__.create(engine)
    MarketingPeriodMeta.__table__.create(engine)  # get_summary 가 코멘트 메타도 읽는다
    factory = sessionmaker(bind=engine)
    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture
def client(session_factory, monkeypatch):
    # get_summary 는 Depends(get_db)가 아니라 SessionLocal() 을 직접 연다
    monkeypatch.setattr(marketing_router, "SessionLocal", session_factory)

    app = FastAPI()
    app.include_router(marketing_router.router)
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, email="user@example.com", role="user"
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _add_row(
    session_factory,
    year: int,
    month: int,
    *,
    impressions: int = 1000,
    clicks: int = 100,
    cost: float = 10_000.0,
    revenue: float = 50_000.0,
    signup: float = 3.0,
    purchase: float = 2.0,
) -> None:
    db = session_factory()
    db.add(MarketingData(
        report_date=date(year, month, 1), campaign_type="네이버",
        impressions=impressions, clicks=clicks, cost=cost,
        conversions=0, conversion_revenue=revenue,
        signup=signup, purchase=purchase, apply=0.0,
    ))
    db.commit()
    db.close()


def test_summary_includes_mom_and_yoy_blocks(client, session_factory):
    _add_row(session_factory, 2026, 10, impressions=2000, clicks=200, cost=20_000, revenue=40_000)
    _add_row(session_factory, 2026, 9, impressions=1000, clicks=50, cost=10_000, revenue=10_000)
    _add_row(session_factory, 2025, 10, impressions=4000, clicks=100, cost=40_000, revenue=20_000)

    body = client.get("/api/marketing/summary", params={"year": 2026, "month": 10}).json()

    mom, yoy = body["compare_mom"], body["compare_yoy"]
    assert (mom["year"], mom["month"], mom["label"]) == (2026, 9, "26년 9월")
    assert (yoy["year"], yoy["month"], yoy["label"]) == (2025, 10, "25년 10월")

    assert mom["total"]["impressions"] == 1000
    assert yoy["total"]["impressions"] == 4000
    # 파생지표가 당월 리포트와 같은 공식으로 계산돼야 증감률이 왜곡되지 않는다
    assert mom["total"]["ctr"] == pytest.approx(50 / 1000)
    assert yoy["total"]["roas"] == pytest.approx(20_000 / 40_000)
    # 세부 전환(signup+purchase)이 있으면 그 합이 총 전환수다 (resolve_total_conv)
    assert mom["total"]["total_conv"] == pytest.approx(5.0)


def test_compare_blocks_are_null_when_period_has_no_data(client, session_factory):
    _add_row(session_factory, 2026, 10)

    body = client.get("/api/marketing/summary", params={"year": 2026, "month": 10}).json()

    assert body["compare_mom"] is None
    assert body["compare_yoy"] is None


def test_mom_crosses_the_year_boundary(client, session_factory):
    """1월의 전월은 작년 12월이다."""
    _add_row(session_factory, 2026, 1)
    _add_row(session_factory, 2025, 12, impressions=777)

    body = client.get("/api/marketing/summary", params={"year": 2026, "month": 1}).json()

    mom = body["compare_mom"]
    assert (mom["year"], mom["month"]) == (2025, 12)
    assert mom["total"]["impressions"] == 777
