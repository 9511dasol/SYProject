"""배경 시안 생성 — 병렬 호출 결과 취합과 부분 실패 처리.

Gemini 호출은 모킹한다. 보려는 것: 프리셋별 호출이 전부 나가는지, 일부 실패 시
성공분만 돌아오는지, 전부 실패하면 오류가 되는지, 토큰이 합산되는지.
"""

import asyncio

import pytest

from app.services import image_background_service as svc
from app.services.image_ai_edit_service import ImageGenResult
from app.services.token_usage import TokenUsage


def _result(tokens: int) -> ImageGenResult:
    return ImageGenResult(
        image_bytes=b"\x89PNG-fake",
        usage=TokenUsage.of(prompt=tokens, output=tokens * 2),
    )


def test_collects_variant_per_preset(monkeypatch):
    calls: list[str] = []

    def fake_generate(file_bytes, prompt, mime_type="image/png"):
        calls.append(prompt)
        return _result(10)

    monkeypatch.setattr(svc, "generate_image", fake_generate)

    suggestion, usage = asyncio.run(svc.suggest_backgrounds(b"img"))

    assert len(suggestion.variants) == len(svc.PRESETS)
    # 결과 순서는 단언해도 된다 — asyncio.gather 는 완료 순서가 아니라 인자 순서로
    # 결과를 돌려주므로, 어느 호출이 먼저 끝나든 시안 순서는 PRESETS 를 따른다.
    assert [v.style for v in suggestion.variants] == [k for k, _, _ in svc.PRESETS]

    # 반면 calls 는 to_thread 워커들이 "끝난 순서"로 append 한 목록이다. PRESETS 와
    # 위치로 짝지으면 스레드 스케줄링에 따라 간헐적으로 깨진다(실제로 전체 실행 3회 중
    # 1회 실패했다). 순서와 무관하게 "프리셋 묘사마다 정확히 한 번씩" 나갔는지를 본다.
    assert len(calls) == len(svc.PRESETS)
    assert all(sum(desc in prompt for prompt in calls) == 1 for _, _, desc in svc.PRESETS)
    # 토큰은 성공 호출 합산 — 한 줄 로그로 남아도 집계가 정확해야 한다
    assert usage.prompt_tokens == 10 * len(svc.PRESETS)
    assert usage.output_tokens == 20 * len(svc.PRESETS)


def test_partial_failure_returns_successes_only(monkeypatch):
    def flaky(file_bytes, prompt, mime_type="image/png"):
        # 두 번째 프리셋(그라데이션) 묘사가 들어간 호출만 실패시킨다
        return None if svc.PRESETS[1][2] in prompt else _result(5)

    monkeypatch.setattr(svc, "generate_image", flaky)

    suggestion, usage = asyncio.run(svc.suggest_backgrounds(b"img"))

    assert len(suggestion.variants) == len(svc.PRESETS) - 1
    assert svc.PRESETS[1][0] not in [v.style for v in suggestion.variants]
    assert usage.prompt_tokens == 5 * (len(svc.PRESETS) - 1)


def test_all_failures_raise(monkeypatch):
    monkeypatch.setattr(svc, "generate_image", lambda *a, **k: None)

    with pytest.raises(svc.ImageBackgroundError):
        asyncio.run(svc.suggest_backgrounds(b"img"))


def test_variant_payload_is_base64_png(monkeypatch):
    monkeypatch.setattr(svc, "generate_image", lambda *a, **k: _result(1))

    suggestion, _ = asyncio.run(svc.suggest_backgrounds(b"img"))

    import base64
    v = suggestion.variants[0]
    assert v.mime == "image/png"
    assert base64.b64decode(v.image_base64) == b"\x89PNG-fake"
