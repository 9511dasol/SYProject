"""/healthz 헬스체크.

`/` 는 DB를 건드리지 않아 연결이 끊겨도 200을 돌려준다 — 모니터링이 실제 장애를
감지하려면 의존 서비스까지 확인해야 한다.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_db
from app.routers import health_router


def _client(db_factory) -> TestClient:
    app = FastAPI()
    app.include_router(health_router.router)
    app.dependency_overrides[get_db] = db_factory
    return TestClient(app)


@pytest.fixture
def working_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_healthz_ok_when_database_reachable(working_db):
    response = _client(lambda: working_db).get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_healthz_503_when_database_unreachable():
    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    response = _client(lambda: BrokenSession()).get("/healthz")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "error"}
