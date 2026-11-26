"""AI 코멘트 재사용 — 같은 질문을 두 번 사지 않는다.

판정 기준은 **보낸 프롬프트 자체**다. 글자 하나까지 같으면 AI 에게 똑같은 질문을 하는
것이므로 저장된 답을 쓴다. 이 기준이 지켜야 할 경계가 몇 가지 있다.

- 실적이 바뀌면 다시 물어야 한다 (안 그러면 낡은 코멘트가 계속 나간다)
- 프롬프트 템플릿을 고쳐도 다시 물어야 한다
- 사람이 엑셀에서 넣은 코멘트를 AI 산출물로 착각해 재사용하면 안 된다
- 캐시가 깨져도 코멘트 생성 자체는 되어야 한다 (비용 절감 장치일 뿐이다)
"""

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.marketing_model import MarketingPeriodMeta
from app.repositories.marketing_repo import MarketingRepository
from app.services import comment_cache


@compiles(JSONB, "sqlite")
def _jsonb_as_json(type_, compiler, **kw):
    return "JSON"


@pytest.fixture
def cache(monkeypatch):
    engine = sa.create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    MarketingPeriodMeta.__table__.create(engine)
    monkeypatch.setattr(comment_cache, "SessionLocal", sessionmaker(bind=engine))
    try:
        yield engine
    finally:
        engine.dispose()


# ── 지문 ─────────────────────────────────────────────────────────────────────


def test_same_prompt_gives_the_same_fingerprint():
    assert comment_cache.fingerprint("같은 질문") == comment_cache.fingerprint("같은 질문")


def test_different_prompts_give_different_fingerprints():
    assert comment_cache.fingerprint("질문 A") != comment_cache.fingerprint("질문 B")


def test_a_single_character_change_changes_the_fingerprint():
    """숫자 하나만 달라져도 다른 질문이다 — 실적이 바뀌면 다시 물어야 한다."""
    assert comment_cache.fingerprint("비용 100만원") != comment_cache.fingerprint("비용 101만원")


def test_fingerprint_is_stored_as_a_hex_digest():
    """컬럼이 String(64) 다 — 길이가 넘으면 저장에서 잘린다."""
    value = comment_cache.fingerprint("아무 질문")
    assert len(value) == 64 and all(c in "0123456789abcdef" for c in value)


# ── 저장·재사용 ──────────────────────────────────────────────────────────────


def test_saved_comment_is_reused_for_the_same_prompt(cache):
    key = comment_cache.fingerprint("7월 실적 요약해줘")
    comment_cache.save(2026, 7, key, "7월은 전월 대비 매출이 늘었습니다.", company_id=1)

    assert comment_cache.lookup(2026, 7, key, company_id=1) == "7월은 전월 대비 매출이 늘었습니다."


def test_nothing_is_reused_when_the_data_changed(cache):
    """실적이 바뀌면 프롬프트가 달라진다 — 낡은 코멘트를 내보내면 안 된다."""
    comment_cache.save(2026, 7, comment_cache.fingerprint("비용 100만원"), "예전 코멘트", company_id=1)

    assert comment_cache.lookup(2026, 7, comment_cache.fingerprint("비용 250만원"), company_id=1) is None


def test_nothing_is_reused_for_another_period(cache):
    key = comment_cache.fingerprint("같은 질문")
    comment_cache.save(2026, 7, key, "7월 코멘트", company_id=1)

    assert comment_cache.lookup(2026, 8, key, company_id=1) is None


def test_lookup_on_an_empty_store_returns_none(cache):
    assert comment_cache.lookup(2026, 7, comment_cache.fingerprint("질문"), company_id=1) is None


def test_regenerating_replaces_the_previous_comment(cache):
    first = comment_cache.fingerprint("질문 1")
    second = comment_cache.fingerprint("질문 2")

    comment_cache.save(2026, 7, first, "첫 코멘트", company_id=1)
    comment_cache.save(2026, 7, second, "두 번째 코멘트", company_id=1)

    assert comment_cache.lookup(2026, 7, second, company_id=1) == "두 번째 코멘트"
    assert comment_cache.lookup(2026, 7, first, company_id=1) is None   # 옛 지문으로는 안 나온다


def test_save_returns_the_time_it_was_stored(cache):
    """화면이 '언제 생성됐는지'를 보여준다."""
    saved_at = comment_cache.save(2026, 7, comment_cache.fingerprint("질문"), "코멘트", company_id=1)
    assert saved_at is not None


# ── 사람이 쓴 코멘트와 구분 ──────────────────────────────────────────────────


def test_a_human_written_comment_is_never_reused_as_ai_output(cache):
    """엑셀 B32 에서 들어온 코멘트는 AI 가 만든 게 아니다 — 지문이 없어야 한다."""
    Session = comment_cache.SessionLocal
    db = Session()
    try:
        MarketingRepository(db, 1).upsert_period_meta(2026, 7, comment="담당자가 직접 쓴 코멘트")
        db.commit()
    finally:
        db.close()

    # 어떤 지문으로 물어도 재사용되지 않는다
    assert comment_cache.lookup(2026, 7, comment_cache.fingerprint("아무 질문"), company_id=1) is None


def test_overwriting_an_ai_comment_by_hand_clears_the_fingerprint(cache):
    """AI 코멘트를 사람이 덮어썼는데 옛 지문이 남아 있으면, 그 사람 글이 AI 답으로 재사용된다."""
    key = comment_cache.fingerprint("질문")
    comment_cache.save(2026, 7, key, "AI 코멘트", company_id=1)

    Session = comment_cache.SessionLocal
    db = Session()
    try:
        MarketingRepository(db, 1).upsert_period_meta(2026, 7, comment="사람이 고친 코멘트")
        db.commit()
    finally:
        db.close()

    assert comment_cache.lookup(2026, 7, key, company_id=1) is None


def test_an_empty_comment_is_not_reused(cache):
    comment_cache.save(2026, 7, comment_cache.fingerprint("질문"), "", company_id=1)
    assert comment_cache.lookup(2026, 7, comment_cache.fingerprint("질문"), company_id=1) is None


# ── 캐시가 깨져도 기능은 살아야 한다 ────────────────────────────────────────


def test_lookup_failure_is_treated_as_a_miss(cache, monkeypatch):
    """캐시는 비용 절감 장치다 — 여기서 예외가 나면 코멘트 생성 자체가 실패한다."""
    monkeypatch.setattr(
        "app.repositories.marketing_repo.MarketingRepository.get_comment_for_prompt",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("DB 끊김")),
    )
    assert comment_cache.lookup(2026, 7, "어떤지문", company_id=1) is None


def test_save_failure_does_not_raise(cache, monkeypatch):
    """코멘트는 이미 만들어졌다 — 저장 실패로 사용자 요청을 깨뜨리면 토큰을 또 쓴다."""
    monkeypatch.setattr(
        "app.repositories.marketing_repo.MarketingRepository.upsert_period_meta",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("DB 끊김")),
    )
    assert comment_cache.save(2026, 7, "지문", "코멘트", company_id=1) is None
