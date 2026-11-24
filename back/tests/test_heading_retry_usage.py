"""헤딩 생성 재시도의 토큰 집계.

Gemini 호출이 성공한 순간 토큰은 과금된다 — 파싱 실패나 10개 미달로 버려진
시도도 예외가 아니다. 그런데 예전 구현은 "채택된 시도 1건"의 usage 만 반환해서,
재시도가 낀 요청은 ai_tool_usage_logs 합계(= 월간 예산의 근거)가 실소비보다
작게 잡혔다. 모든 시도를 합산해 반환하는지, 전부 실패해도 과금분이
HeadingGenerationError 에 실려 나오는지를 고정한다.
"""

import json

import pytest

from app.services import heading_service
from app.services.heading_service import (
    HeadingGenerationError,
    generate_headings,
)
from app.services.token_usage import TokenUsage

_PLATFORMS = ["Instagram"] * 4 + ["Blog"] * 3 + ["YouTube"] * 3


def _response_json(count: int) -> str:
    headings = [
        {"id": i + 1, "platform": _PLATFORMS[i], "text": f"제목 {i + 1}", "desc": "추천 이유 설명"}
        for i in range(count)
    ]
    return json.dumps({"headings": headings}, ensure_ascii=False)


def _usage(prompt: int, output: int) -> TokenUsage:
    return TokenUsage(prompt_tokens=prompt, output_tokens=output, total_tokens=prompt + output)


@pytest.fixture
def no_thumbnail(monkeypatch):
    """PIL 디코드를 건너뛴다 — 여기서 검증하는 건 재시도 집계뿐이다."""
    monkeypatch.setattr(heading_service, "_make_thumbnail_bytes", lambda b: b"thumb")


def _fake_gemini(monkeypatch, attempts: list):
    """시도 순서대로 (응답 텍스트, usage) 를 돌려주거나 예외를 던지는 가짜."""
    calls = iter(attempts)

    async def fake(_thumbnail: bytes, _platform: str | None = None):
        item = next(calls)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(heading_service, "_call_gemini", fake)


@pytest.mark.asyncio
async def test_a_retried_request_reports_the_sum_of_both_attempts(monkeypatch, no_thumbnail):
    """8개 → 재시도 → 10개: 두 호출 모두 과금됐으니 usage 는 합계여야 한다."""
    _fake_gemini(monkeypatch, [
        (_response_json(8), _usage(100, 50)),
        (_response_json(10), _usage(100, 60)),
    ])

    result, usage, _ = await generate_headings(b"img")

    assert len(result.headings) == 10
    assert usage == _usage(200, 110)


@pytest.mark.asyncio
async def test_a_parse_failed_attempt_is_still_counted(monkeypatch, no_thumbnail):
    """JSON 이 깨진 시도도 호출 자체는 성공 — 과금분을 합산에서 빠뜨리면 안 된다."""
    _fake_gemini(monkeypatch, [
        ("이건 JSON이 아님", _usage(100, 10)),
        (_response_json(10), _usage(100, 60)),
    ])

    result, usage, _ = await generate_headings(b"img")

    assert len(result.headings) == 10
    assert usage == _usage(200, 70)


@pytest.mark.asyncio
async def test_total_failure_with_charges_raises_an_error_carrying_the_usage(monkeypatch, no_thumbnail):
    """모든 시도가 파싱 실패여도 과금은 됐다 — 라우터가 기록할 수 있게 예외에 싣는다."""
    _fake_gemini(monkeypatch, [
        ("깨진 응답 1", _usage(100, 10)),
        ("깨진 응답 2", _usage(100, 20)),
    ])

    with pytest.raises(HeadingGenerationError) as exc_info:
        await generate_headings(b"img")

    assert exc_info.value.usage == _usage(200, 30)


@pytest.mark.asyncio
async def test_pure_api_failure_raises_without_usage(monkeypatch, no_thumbnail):
    """호출 자체가 전부 실패하면 과금분이 없다 — 일반 RuntimeError 로 끝난다."""
    _fake_gemini(monkeypatch, [
        RuntimeError("Gemini API 오류 (503): 과부하"),
        RuntimeError("Gemini API 오류 (503): 과부하"),
    ])

    with pytest.raises(RuntimeError) as exc_info:
        await generate_headings(b"img")

    assert not isinstance(exc_info.value, HeadingGenerationError)


@pytest.mark.asyncio
async def test_a_short_but_best_result_reports_all_attempts(monkeypatch, no_thumbnail):
    """끝까지 10개를 못 채워 최선(8개)을 반환할 때도 usage 는 전체 합산이어야 한다."""
    _fake_gemini(monkeypatch, [
        (_response_json(8), _usage(100, 40)),
        (_response_json(7), _usage(100, 35)),
    ])

    result, usage, _ = await generate_headings(b"img")

    assert len(result.headings) == 8
    assert usage == _usage(200, 75)
