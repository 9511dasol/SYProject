"""헤딩 문구 기록 페이지네이션.

생성 페이지의 썸네일 스트립은 최근 몇 건만 보여주지만, 히스토리 페이지는 오래된
기록까지 이어서 봐야 해서 offset/total 이 필요하다.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.heading_suggestion_model import HeadingSuggestion
from app.repositories.heading_suggestion_repo import HeadingSuggestionRepository

_HEADINGS = [{"id": 1, "platform": "Blog", "text": "문구", "desc": "이유"}]


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    # JSONB 컬럼은 SQLite에서 만들 수 없으므로 JSON으로 바꿔 테이블만 생성한다.
    table = HeadingSuggestion.__table__
    from sqlalchemy import JSON

    original = table.c.headings.type
    table.c.headings.type = JSON()
    try:
        table.create(engine)
    finally:
        table.c.headings.type = original

    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _add(db, user_id: int, *, minutes_ago: int, filename: str = "img.jpg") -> HeadingSuggestion:
    record = HeadingSuggestion(
        user_id=user_id,
        user_email=f"user{user_id}@example.com",
        image_filename=filename,
        image_path=None,
        headings=_HEADINGS,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    )
    db.add(record)
    db.commit()
    return record


def test_newest_first(db):
    _add(db, 1, minutes_ago=60, filename="old.jpg")
    _add(db, 1, minutes_ago=1, filename="new.jpg")

    items = HeadingSuggestionRepository(db).list_for_user(1)
    assert [r.image_filename for r in items] == ["new.jpg", "old.jpg"]


def test_offset_pages_do_not_overlap(db):
    for i in range(5):
        _add(db, 1, minutes_ago=i, filename=f"{i}.jpg")

    repo = HeadingSuggestionRepository(db)
    page1 = repo.list_for_user(1, limit=2, offset=0)
    page2 = repo.list_for_user(1, limit=2, offset=2)

    assert len(page1) == len(page2) == 2
    assert {r.id for r in page1}.isdisjoint({r.id for r in page2})


def test_same_timestamp_keeps_stable_order(db):
    """created_at이 같아도 순서가 흔들리면 페이지 사이에서 항목이 중복·누락된다."""
    for _ in range(4):
        _add(db, 1, minutes_ago=0)

    repo = HeadingSuggestionRepository(db)
    all_ids = [r.id for r in repo.list_for_user(1, limit=10)]
    paged = [
        *[r.id for r in repo.list_for_user(1, limit=2, offset=0)],
        *[r.id for r in repo.list_for_user(1, limit=2, offset=2)],
    ]
    assert paged == all_ids


def test_count_is_independent_of_limit(db):
    for i in range(7):
        _add(db, 1, minutes_ago=i)

    repo = HeadingSuggestionRepository(db)
    assert len(repo.list_for_user(1, limit=3)) == 3
    assert repo.count_for_user(1) == 7


def test_other_users_records_are_not_visible(db):
    _add(db, 1, minutes_ago=1)
    _add(db, 2, minutes_ago=1)
    _add(db, 2, minutes_ago=2)

    repo = HeadingSuggestionRepository(db)
    assert repo.count_for_user(1) == 1
    assert [r.user_id for r in repo.list_for_user(2)] == [2, 2]


def test_offset_past_end_returns_empty(db):
    _add(db, 1, minutes_ago=1)
    assert HeadingSuggestionRepository(db).list_for_user(1, offset=10) == []
