"""플랫폼별 재생성 — 프롬프트 파생, 응답 필터, 레코드 병합.

"Instagram만 다시"가 가능하려면 세 가지 약속이 지켜져야 한다:
  1. 프롬프트의 개수("EXACTLY 10"·"4 headings")가 스펙 한 곳에서 파생될 것 —
     예전처럼 문자열과 상수에 각자 하드코딩돼 있으면 조용히 어긋난다.
  2. 단일 플랫폼 요청에 모델이 다른 플랫폼을 섞어 보내도 요청한 것만 남을 것 —
     섞인 채 병합되면 같은 플랫폼 문구가 중복으로 쌓인다.
  3. 병합은 해당 플랫폼만 교체하고 순서·id 를 다시 매길 것 — 재생성을 반복해도
     화면과 기록의 순서가 흔들리면 안 된다.
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from sqlalchemy import JSON, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.ai_budget import require_ai_budget
from app.core.rate_limit import limiter
from app.core.security import get_current_user, get_db
from app.models.heading_suggestion_model import HeadingSuggestion
from app.models.system_setting_model import SystemSetting
from app.models.user_model import User
from app.routers import heading_router
from app.services import heading_service
from app.services.heading_service import generate_headings, merge_platform_headings
from app.services.token_usage import TokenUsage


def _item(platform: str, text: str, id: int = 1) -> dict:
    return {"id": id, "platform": platform, "text": text, "desc": "추천 이유 설명"}


# ── 1. 프롬프트가 스펙에서 파생되는가 ────────────────────────────────────────

def test_full_prompt_derives_counts_from_the_spec():
    prompt = heading_service._build_system_prompt()
    assert "EXACTLY 10" in prompt
    assert "Instagram (4 headings)" in prompt
    assert "Blog (3 headings)" in prompt
    assert "YouTube (3 headings)" in prompt
    assert "Instagram × 4, Blog × 3, YouTube × 3" in prompt


def test_single_platform_prompt_mentions_only_that_platform():
    prompt = heading_service._build_system_prompt("Blog")
    assert "EXACTLY 3" in prompt
    assert "Blog (3 headings)" in prompt
    assert "Instagram" not in prompt
    assert "YouTube" not in prompt
    assert '"platform": "Blog"' in prompt


# ── 2. 응답 필터 — 요청한 플랫폼만 남는가 ────────────────────────────────────

def test_parse_keeps_only_the_requested_platform_and_renumbers():
    raw = json.dumps({"headings": [
        _item("Blog", "잘못 섞인 문구", id=7),
        _item("Instagram", "인스타 1", id=9),
        _item("Instagram", "인스타 2", id=3),
    ]}, ensure_ascii=False)

    result = heading_service._parse_response(raw, target=4, platform="Instagram")

    assert [h.platform for h in result.headings] == ["Instagram", "Instagram"]
    assert [h.id for h in result.headings] == [1, 2]


def test_parse_fails_when_nothing_matches_the_requested_platform():
    """전부 다른 플랫폼이면 빈 결과 — 성공으로 넘기지 말고 재시도로 이어져야 한다."""
    raw = json.dumps({"headings": [_item("Blog", "문구")]}, ensure_ascii=False)
    with pytest.raises(RuntimeError):
        heading_service._parse_response(raw, target=4, platform="Instagram")


# ── 3. 병합 — 해당 플랫폼만 교체, 순서·id 재부여 ─────────────────────────────

def test_merge_replaces_only_the_target_platform_in_spec_order():
    existing = [
        _item("Instagram", "옛 인스타 1", id=1),
        _item("Instagram", "옛 인스타 2", id=2),
        _item("Blog", "블로그 1", id=3),
        _item("YouTube", "유튜브 1", id=4),
    ]
    new_items = [_item("Instagram", "새 인스타 1", id=99), _item("Instagram", "새 인스타 2", id=98)]

    merged = merge_platform_headings(existing, new_items, "Instagram")

    assert [(h["platform"], h["text"]) for h in merged] == [
        ("Instagram", "새 인스타 1"),
        ("Instagram", "새 인스타 2"),
        ("Blog", "블로그 1"),
        ("YouTube", "유튜브 1"),
    ]
    assert [h["id"] for h in merged] == [1, 2, 3, 4]


def test_merge_does_not_mutate_the_existing_list():
    existing = [_item("Blog", "블로그", id=5)]
    merge_platform_headings(existing, [_item("Instagram", "새", id=9)], "Instagram")
    assert existing[0]["id"] == 5


# ── 4. 단일 플랫폼 생성 — 목표치가 스펙 개수인가 ─────────────────────────────

@pytest.mark.asyncio
async def test_single_platform_generation_targets_the_spec_count(monkeypatch):
    monkeypatch.setattr(heading_service, "_make_thumbnail_bytes", lambda b: b"thumb")

    calls = []

    async def fake(_thumbnail: bytes, platform: str | None = None):
        calls.append(platform)
        headings = [_item("Instagram", f"인스타 {i}", id=i) for i in range(1, 5)]
        return (
            json.dumps({"headings": headings}, ensure_ascii=False),
            TokenUsage(prompt_tokens=10, output_tokens=10, total_tokens=20),
        )

    monkeypatch.setattr(heading_service, "_call_gemini", fake)

    result, _, _ = await generate_headings(b"img", "Instagram")

    # 4개면 목표 달성 — 전체 목표(10개) 기준이었다면 미달로 재시도했을 것
    assert calls == ["Instagram"]
    assert len(result.headings) == 4


# ── 5. 라우터 — record_id 병합 경로 ──────────────────────────────────────────

_FULL_SET = (
    [_item("Instagram", f"인스타 {i}", id=i) for i in range(1, 5)]
    + [_item("Blog", f"블로그 {i}", id=i + 4) for i in range(1, 4)]
    + [_item("YouTube", f"유튜브 {i}", id=i + 7) for i in range(1, 4)]
)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    # JSONB 컬럼은 SQLite에서 만들 수 없으므로 JSON으로 바꿔 테이블만 생성한다.
    table = HeadingSuggestion.__table__
    original = table.c.headings.type
    table.c.headings.type = JSON()
    try:
        table.create(engine)
    finally:
        table.c.headings.type = original
    SystemSetting.__table__.create(engine)  # 기능 플래그 조회용 (비어 있으면 허용)

    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session, monkeypatch):
    # 외부 의존(AI·스토리지·사용량 로그)은 라우터 검증 대상이 아니다
    async def fake_generate(_file_bytes: bytes, platform: str | None = None):
        headings = heading_service.HeadingResponse.model_validate(
            {"headings": [_item("Instagram", f"새 인스타 {i}", id=i) for i in range(1, 5)]}
        )
        return headings, None, b"thumb"

    monkeypatch.setattr(heading_router, "generate_headings", fake_generate)
    monkeypatch.setattr(heading_router, "log_ai_usage", lambda **kwargs: None)
    monkeypatch.setattr(heading_router, "_upload_thumbnail", lambda user_id, b: None)

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(heading_router.router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, email="user@example.com", role="member", company_id=1
    )
    app.dependency_overrides[require_ai_budget] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _seed_record(db_session, user_id: int = 1) -> HeadingSuggestion:
    record = HeadingSuggestion(company_id=1, 
        user_id=user_id,
        user_email=f"user{user_id}@example.com",
        image_filename="img.jpg",
        image_path=None,
        headings=_FULL_SET,
    )
    db_session.add(record)
    db_session.commit()
    return record


def _post_suggest(client, data: dict | None = None):
    return client.post(
        "/api/heading/suggest",
        files={"file": ("img.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")},
        data=data or {},
    )


def test_regenerate_merges_into_the_existing_record(client, db_session):
    record = _seed_record(db_session)

    res = _post_suggest(client, {"platform": "Instagram", "record_id": str(record.id)})

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == record.id  # 새 기록이 아니라 같은 기록이 갱신된다
    texts = [(h["platform"], h["text"]) for h in body["headings"]]
    assert texts[:4] == [("Instagram", f"새 인스타 {i}") for i in range(1, 5)]
    assert texts[4:] == [(h["platform"], h["text"]) for h in _FULL_SET[4:]]
    assert [h["id"] for h in body["headings"]] == list(range(1, 11))
    # 히스토리에 부분 기록이 늘지 않는다
    assert db_session.query(HeadingSuggestion).count() == 1


def test_record_id_without_platform_is_rejected(client, db_session):
    record = _seed_record(db_session)
    res = _post_suggest(client, {"record_id": str(record.id)})
    assert res.status_code == 422


def test_record_id_of_another_user_is_not_found(client, db_session):
    record = _seed_record(db_session, user_id=2)
    res = _post_suggest(client, {"platform": "Instagram", "record_id": str(record.id)})
    assert res.status_code == 404


def test_unknown_platform_value_is_rejected(client):
    res = _post_suggest(client, {"platform": "TikTok"})
    assert res.status_code == 422
