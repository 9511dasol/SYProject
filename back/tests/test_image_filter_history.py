"""이미지 편집 기록(②-B) — 보관·조회 범위·만료·이미지 프록시·삭제.

2026-11-28, "이미지는 서버에 저장하지 않는다"는 원래 설계를 사용자 결정으로
바꿨다. 지켜야 할 약속들:

  1. **본인 기록만** 보인다 — 기업+사용자 이중 범위 (11-26 사고의 재발 방지).
  2. 예산을 넘겨도 **조회·삭제는 막히지 않는다** — 돈이 드는 행동만 멈춘다.
  3. 보관 기간이 지나면 **이미지만** 사라지고 레코드(프롬프트)는 남는다.
  4. 삭제는 레코드와 스토리지 객체를 **함께** 지운다.
  5. 편집 전송이 성공하면 결과가 기업·사용자 경로로 **자동 보관**된다.
"""

import base64
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.ai_budget import require_ai_budget
from app.core.security import get_current_user, get_db
from app.models.company_model import Company
from app.models.image_edit_record_model import ImageEditRecord
from app.models.system_setting_model import SystemSetting
from app.models.user_model import User
from app.repositories.image_edit_record_repo import ImageEditRecordRepository
from app.routers import image_filter_router
from app.services.image_filter_service import EditResult, EditVariant

ME, COLLEAGUE = 1, 2
MY_COMPANY, OTHER_COMPANY = 1, 2
_PNG = b"\x89PNG-fake"


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Company.__table__.create(engine)
    ImageEditRecord.__table__.create(engine)
    SystemSetting.__table__.create(engine)  # 기능 플래그 조회용 (비어 있으면 허용)
    session = sessionmaker(bind=engine)()
    session.add(Company(id=MY_COMPANY, name="sy", is_active=True, is_trial=False))
    session.add(Company(id=OTHER_COMPANY, name="other", is_active=True, is_trial=False))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


class FakeStorage:
    """스토리지 대역 — 업로드·삭제를 기록해 호출 경로를 검증한다."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []

    def upload_bytes(self, path, content, content_type="image/jpeg"):
        self.objects[path] = content
        return path

    def download_bytes(self, path):
        return self.objects.get(path)

    def delete_object(self, path):
        self.deleted.append(path)
        self.objects.pop(path, None)


@pytest.fixture
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(image_filter_router.storage_service, "upload_bytes", fake.upload_bytes)
    monkeypatch.setattr(image_filter_router.storage_service, "download_bytes", fake.download_bytes)
    monkeypatch.setattr(image_filter_router.storage_service, "delete_object", fake.delete_object)
    return fake


def _seed(db, *, user_id=ME, company_id=MY_COMPANY, paths=None, prompt="배경을 하얗게",
          variant_count=2, days_ago=0) -> ImageEditRecord:
    record = ImageEditRecord(
        company_id=company_id,
        user_id=user_id,
        user_email=f"u{user_id}@example.com",
        image_filename="img.png",
        prompt=prompt,
        image_paths=paths if paths is not None else [f"image-edits/{company_id}/{user_id}/a.jpg"],
        variant_count=variant_count,
        mime="image/jpeg",
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _client(db, *, user_id=ME, company_id=MY_COMPANY, budget_ok=True):
    app = FastAPI()
    app.include_router(image_filter_router.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: User(
        id=user_id, email=f"u{user_id}@example.com", role="member", company_id=company_id
    )

    def budget():
        if not budget_ok:
            raise HTTPException(status_code=429, detail="월 예산 초과")

    app.dependency_overrides[require_ai_budget] = budget
    return TestClient(app)


# ── 1. 조회 범위 ─────────────────────────────────────────────────────────────

def test_only_my_own_records_are_returned(db_session):
    _seed(db_session, user_id=ME, prompt="내 작업")
    _seed(db_session, user_id=COLLEAGUE, prompt="동료 작업")

    body = _client(db_session).get("/api/image-filter/history").json()

    assert [i["prompt"] for i in body["items"]] == ["내 작업"]
    assert body["total"] == 1


def test_other_companies_are_never_visible(db_session):
    _seed(db_session, user_id=ME, company_id=OTHER_COMPANY, prompt="다른 고객사")

    body = _client(db_session).get("/api/image-filter/history").json()
    assert body["items"] == [] and body["total"] == 0


def test_history_reports_retention_days(db_session):
    """화면 고지("N일 보관")가 서버 설정과 어긋나지 않도록 응답에 실어 준다."""
    from app.core.settings import settings

    body = _client(db_session).get("/api/image-filter/history").json()
    assert body["retention_days"] == settings.IMAGE_EDIT_RETENTION_DAYS


# ── 2. 예산과 무관하게 읽을 수 있다 ──────────────────────────────────────────

def test_history_is_readable_even_when_the_budget_is_exhausted(db_session):
    _seed(db_session)
    res = _client(db_session, budget_ok=False).get("/api/image-filter/history")
    assert res.status_code == 200


# ── 3. 만료 표시 ─────────────────────────────────────────────────────────────

def test_expired_record_reports_no_images_but_keeps_the_prompt(db_session):
    """이미지는 사라져도 "그때 뭐라고 시켰는지"와 장수는 남아야 한다."""
    record = _seed(db_session, paths=[], variant_count=4, prompt="만료된 작업")

    body = _client(db_session).get("/api/image-filter/history").json()
    item = body["items"][0]

    assert item["id"] == record.id
    assert item["prompt"] == "만료된 작업"
    assert item["variant_count"] == 4
    assert item["images_available"] is False


# ── 4. 이미지 프록시 ─────────────────────────────────────────────────────────

def test_image_is_served_for_the_owner(db_session, storage):
    record = _seed(db_session, paths=["image-edits/1/1/a.jpg"])
    storage.objects["image-edits/1/1/a.jpg"] = _PNG

    res = _client(db_session).get(f"/api/image-filter/history/{record.id}/images/0")

    assert res.status_code == 200
    assert res.content == _PNG
    assert res.headers["content-type"].startswith("image/")


def test_image_of_a_colleague_is_not_served(db_session, storage):
    """URL 을 알아도 남의 이미지는 못 본다 — 격리는 경로 추측에도 버텨야 한다."""
    record = _seed(db_session, user_id=COLLEAGUE, paths=["image-edits/1/2/a.jpg"])
    storage.objects["image-edits/1/2/a.jpg"] = _PNG

    res = _client(db_session).get(f"/api/image-filter/history/{record.id}/images/0")
    assert res.status_code == 404


def test_out_of_range_index_is_404(db_session, storage):
    record = _seed(db_session, paths=["image-edits/1/1/a.jpg"])
    assert _client(db_session).get(
        f"/api/image-filter/history/{record.id}/images/5"
    ).status_code == 404


# ── 5. 삭제 ──────────────────────────────────────────────────────────────────

def test_delete_removes_the_record_and_its_storage_objects(db_session, storage):
    record = _seed(db_session, paths=["image-edits/1/1/a.jpg", "image-edits/1/1/b.jpg"])

    res = _client(db_session).delete(f"/api/image-filter/history/{record.id}")

    assert res.status_code == 204
    assert sorted(storage.deleted) == ["image-edits/1/1/a.jpg", "image-edits/1/1/b.jpg"]
    assert db_session.query(ImageEditRecord).count() == 0


def test_delete_of_a_colleagues_record_is_404(db_session, storage):
    record = _seed(db_session, user_id=COLLEAGUE)
    assert _client(db_session).delete(
        f"/api/image-filter/history/{record.id}"
    ).status_code == 404
    assert db_session.query(ImageEditRecord).count() == 1


# ── 6. 편집 전송 시 자동 보관 ────────────────────────────────────────────────

def _edit_result(count: int) -> EditResult:
    return EditResult(
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
    )


def _post_edit(client, data=None):
    return client.post(
        "/api/image-filter/edit",
        files={"file": ("img.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")},
        data=data or {"prompt": "배경을 하얗게", "count": "2"},
    )


@pytest.fixture
def edit_client(db_session, storage, monkeypatch):
    async def fake_edit_variants(**kwargs):
        return _edit_result(kwargs["count"]), None

    monkeypatch.setattr(image_filter_router, "edit_variants", fake_edit_variants)
    monkeypatch.setattr(image_filter_router, "log_ai_usage", lambda **kwargs: None)
    return _client(db_session)


def test_a_successful_edit_is_persisted_with_tenant_scoped_paths(db_session, storage, edit_client):
    res = _post_edit(edit_client)
    assert res.status_code == 200

    record = db_session.query(ImageEditRecord).one()
    assert record.company_id == MY_COMPANY and record.user_id == ME
    assert record.variant_count == 2
    assert len(record.image_paths) == 2
    # 경로 격리 — 기업/사용자 단위 디렉터리
    assert all(p.startswith(f"image-edits/{MY_COMPANY}/{ME}/") for p in record.image_paths)
    # 실제로 업로드까지 됐다
    assert all(storage.objects[p] == _PNG for p in record.image_paths)


def test_thread_id_is_stored_and_returned_in_history(db_session, storage, edit_client):
    """같은 작업의 전송들이 한 대화로 묶이려면 id 가 저장되고 조회로 돌아와야 한다."""
    thread = "0b8f6f0e-6c1d-4f0a-9d53-1f2a3b4c5d6e"
    res = _post_edit(edit_client, {"prompt": "배경을 하얗게", "count": "1", "thread_id": thread})
    assert res.status_code == 200

    assert db_session.query(ImageEditRecord).one().thread_id == thread
    items = edit_client.get("/api/image-filter/history").json()["items"]
    assert [i["thread_id"] for i in items] == [thread]


def test_edit_without_thread_id_still_works(db_session, storage, edit_client):
    """구버전 화면은 id 를 보내지 않는다 — 편집은 그대로 되고 기록은 NULL 로 남는다."""
    assert _post_edit(edit_client).status_code == 200

    assert db_session.query(ImageEditRecord).one().thread_id is None
    assert edit_client.get("/api/image-filter/history").json()["items"][0]["thread_id"] is None


def test_malformed_thread_id_is_rejected(db_session, storage, edit_client):
    res = _post_edit(edit_client, {"prompt": "x", "count": "1", "thread_id": "a b;drop"})
    assert res.status_code == 422
    assert db_session.query(ImageEditRecord).count() == 0


def test_a_storage_failure_does_not_fail_the_edit_response(db_session, edit_client, monkeypatch):
    """사용자는 이미 토큰을 썼다 — 보관이 안 돼도 결과는 받아야 한다."""
    def broken_upload(*a, **k):
        raise RuntimeError("storage down")

    monkeypatch.setattr(image_filter_router.storage_service, "upload_bytes", broken_upload)

    res = _post_edit(edit_client)

    assert res.status_code == 200          # 응답은 정상
    record = db_session.query(ImageEditRecord).one()
    assert record.image_paths == []        # 보관만 빈 채로 남는다
    assert record.variant_count == 2


# ── 7. 보관 기간 정리 (크론 경로) ────────────────────────────────────────────

def test_purge_clears_images_but_keeps_expired_records(db_session, storage):
    from app.core.settings import settings

    old = _seed(db_session, paths=["image-edits/1/1/old.jpg"],
                days_ago=settings.IMAGE_EDIT_RETENTION_DAYS + 1)
    fresh = _seed(db_session, paths=["image-edits/1/1/new.jpg"], days_ago=1)
    storage.objects.update({"image-edits/1/1/old.jpg": _PNG, "image-edits/1/1/new.jpg": _PNG})

    repo = ImageEditRecordRepository(db_session)
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.IMAGE_EDIT_RETENTION_DAYS)
    for record in repo.list_expired(cutoff):
        for path in record.image_paths:
            storage.delete_object(path)
        repo.clear_images(record)

    db_session.refresh(old)
    db_session.refresh(fresh)
    assert old.image_paths == []                       # 이미지만 사라지고
    assert old.prompt == "배경을 하얗게"                 # 레코드는 남는다
    assert fresh.image_paths == ["image-edits/1/1/new.jpg"]  # 기간 안은 그대로
    assert storage.deleted == ["image-edits/1/1/old.jpg"]
