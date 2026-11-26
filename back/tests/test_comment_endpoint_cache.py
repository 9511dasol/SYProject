"""코멘트 생성 엔드포인트 — 같은 데이터면 LLM 을 부르지 않는다.

캐시의 목적은 "토큰을 아낀다"이므로, 저장된 코멘트가 있을 때 **실제로 LLM 호출이
생략되는지**와 **사용량 로그에 호출로 남지 않는지**를 본다. 로그에 남으면 쓰지도 않은
토큰만큼 월 예산이 줄어든다.

문구가 마음에 들지 않을 때를 위한 탈출구(force)도 함께 고정한다.
"""

import pytest

from app.services.comment_service import CommentResult
from app.services.token_usage import TokenUsage

_USAGE = TokenUsage(prompt_tokens=1000, output_tokens=200, total_tokens=1200)


@pytest.fixture
def wired(mocker):
    """LLM·DB 를 걷어내고 캐시 동작만 남긴다."""
    import app.routers.marketing_router as router

    mocker.patch.object(router, "SessionLocal", mocker.MagicMock())
    mocker.patch.object(router, "AnalysisService", mocker.MagicMock())
    mocker.patch.object(router, "build_llm", mocker.MagicMock())

    service = mocker.MagicMock()
    service.build_prompt.return_value = "7월 실적을 요약해줘"
    service.generate_with_usage.return_value = CommentResult(
        text="새로 만든 코멘트", usage=_USAGE, cached=False
    )
    mocker.patch.object(router, "CommentService", return_value=service)

    logged = mocker.patch.object(router, "log_ai_usage")
    lookup = mocker.patch("app.services.comment_cache.lookup", return_value=None)
    save = mocker.patch("app.services.comment_cache.save", return_value=None)
    mocker.patch.object(router, "_read_comment_meta", return_value=("", None))

    return {"router": router, "service": service, "logged": logged, "lookup": lookup, "save": save}


async def _call(router, *, force=False):
    from app.core.tenant import TenantContext
    from app.models.user_model import User

    ctx = TenantContext(user=User(id=1, email="t@example.com", company_id=1), company_id=1)
    return await router.update_comment(year=2026, month=7, force=force, ctx=ctx)


# ── 저장된 코멘트가 없을 때 ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generates_when_nothing_is_cached(wired):
    result = await _call(wired["router"])

    assert result["comment"] == "새로 만든 코멘트"
    assert result["cached"] is False
    wired["service"].generate_with_usage.assert_called_once()


@pytest.mark.asyncio
async def test_a_generated_comment_is_stored_with_its_fingerprint(wired):
    await _call(wired["router"])

    year, month, prompt_hash, comment = wired["save"].call_args.args
    assert (year, month) == (2026, 7)
    assert comment == "새로 만든 코멘트"
    assert len(prompt_hash) == 64          # 프롬프트 지문


@pytest.mark.asyncio
async def test_generated_comment_is_counted_in_usage(wired):
    await _call(wired["router"])
    assert wired["logged"].call_args.kwargs["usage"] == _USAGE


# ── 저장된 코멘트가 있을 때 ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_does_not_call_the_llm_when_the_question_is_unchanged(wired):
    """핵심 — 같은 질문이면 돈을 쓰지 않는다."""
    wired["lookup"].return_value = "저장돼 있던 코멘트"

    result = await _call(wired["router"])

    assert result["comment"] == "저장돼 있던 코멘트"
    assert result["cached"] is True
    wired["service"].generate_with_usage.assert_not_called()


@pytest.mark.asyncio
async def test_reused_comment_is_not_counted_as_an_ai_call(wired):
    """재사용은 토큰을 쓰지 않았다 — 기록에 남으면 월 예산이 헛되이 줄어든다."""
    wired["lookup"].return_value = "저장돼 있던 코멘트"

    await _call(wired["router"])

    wired["logged"].assert_not_called()


@pytest.mark.asyncio
async def test_reused_comment_is_not_written_again(wired):
    wired["lookup"].return_value = "저장돼 있던 코멘트"

    await _call(wired["router"])

    wired["save"].assert_not_called()


# ── 강제 재생성 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_force_regenerates_even_when_cached(wired):
    """문구가 마음에 들지 않을 때 다른 답을 받을 수단이 있어야 한다."""
    wired["lookup"].return_value = "저장돼 있던 코멘트"

    result = await _call(wired["router"], force=True)

    assert result["comment"] == "새로 만든 코멘트"
    assert result["cached"] is False
    wired["service"].generate_with_usage.assert_called_once()


@pytest.mark.asyncio
async def test_force_does_not_even_consult_the_cache(wired):
    await _call(wired["router"], force=True)
    wired["lookup"].assert_not_called()


@pytest.mark.asyncio
async def test_forced_comment_is_counted_in_usage(wired):
    wired["lookup"].return_value = "저장돼 있던 코멘트"

    await _call(wired["router"], force=True)

    wired["logged"].assert_called_once()
