"""이미지 편집 다건 생성 — 장수 제어, 부분 실패, 토큰 합산, 파일명.

2026-11-27 고객사 요청으로 편집 결과가 1장 고정에서 "기본 4장, 사용자가 1~6장"
으로 바뀌었다. 한 장이 이미지 생성 1회(=과금 1회)이므로 **요청한 장수만큼만
호출되는지**가 이 테스트의 핵심이다.

Gemini 호출은 모킹한다. 보려는 것: 장수대로 호출이 나가는지, 상한을 넘기지
못하는지, 일부 실패 시 성공분만 돌아오고 실패 수가 보고되는지, 전부 실패하면
오류가 되는지, 토큰이 합산되는지.
"""

import asyncio
import base64

import pytest

from app.services import image_filter_service as svc
from app.services.token_usage import TokenUsage


def _fake_edit(tokens: int = 10, fail_after: int | None = None):
    """edit_and_resize 대역. fail_after 번째 호출부터 ImageEditError 를 던진다."""
    calls = {"n": 0}

    def fake(**kwargs):
        calls["n"] += 1
        if fail_after is not None and calls["n"] > fail_after:
            raise svc.ImageEditError("생성 실패")
        import io

        return (
            io.BytesIO(b"\x89PNG-fake"),
            "edited_img.jpg",
            "image/jpeg",
            "Gemini (test)",
            TokenUsage.of(prompt=tokens, output=tokens * 2),
        )

    return fake, calls


def _run(count: int) -> tuple[svc.EditResult, TokenUsage | None]:
    return asyncio.run(
        svc.edit_variants(
            file_bytes=b"img",
            original_filename="img.jpg",
            prompt="배경을 하얗게",
            target_width=None,
            target_height=None,
            count=count,
        )
    )


# ── 장수 ─────────────────────────────────────────────────────────────────────

def test_requested_count_is_the_number_of_calls(monkeypatch):
    """한 장이 과금 1회다 — 요청한 만큼만 호출돼야 한다."""
    fake, calls = _fake_edit()
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    result, _ = _run(4)

    assert calls["n"] == 4
    assert len(result.variants) == 4
    assert result.failed == 0


def test_default_is_four():
    assert svc.DEFAULT_EDIT_VARIANTS == 4


@pytest.mark.parametrize(("asked", "expected"), [(0, 1), (1, 1), (6, 6), (7, 6), (99, 6)])
def test_count_is_clamped_to_the_allowed_range(monkeypatch, asked, expected):
    """상한을 넘는 요청이 그대로 호출 수가 되면 과금이 무한정 늘어난다."""
    fake, calls = _fake_edit()
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    _run(asked)

    assert calls["n"] == expected == min(max(asked, 1), svc.MAX_EDIT_VARIANTS)


# ── 부분 실패 ────────────────────────────────────────────────────────────────

def test_partial_failure_returns_what_succeeded_and_reports_the_rest(monkeypatch):
    """4장 중 1장만 실패했다고 전체를 버리면 성공한 3장의 토큰이 그냥 날아간다."""
    fake, _ = _fake_edit(fail_after=3)
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    result, _ = _run(4)

    assert len(result.variants) == 3
    assert result.failed == 1


def test_all_failed_raises(monkeypatch):
    fake, _ = _fake_edit(fail_after=0)
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    with pytest.raises(svc.ImageEditError):
        _run(3)


# ── 토큰 ─────────────────────────────────────────────────────────────────────

def test_tokens_from_every_successful_call_are_summed(monkeypatch):
    """호출 수와 무관하게 사용량 집계가 정확해야 월간 예산이 실소비와 맞는다."""
    fake, _ = _fake_edit(tokens=10)
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    _, usage = _run(3)

    assert usage.prompt_tokens == 30
    assert usage.output_tokens == 60


def test_failed_calls_contribute_no_tokens(monkeypatch):
    fake, _ = _fake_edit(tokens=10, fail_after=2)
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    _, usage = _run(4)

    assert usage.prompt_tokens == 20  # 성공 2건만


# ── 결과 모양 ────────────────────────────────────────────────────────────────

def test_variants_are_base64_and_numbered(monkeypatch):
    fake, _ = _fake_edit()
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    result, _ = _run(3)

    assert [v.filename for v in result.variants] == [
        "edited_img_1.jpg",
        "edited_img_2.jpg",
        "edited_img_3.jpg",
    ]
    assert base64.b64decode(result.variants[0].image_base64) == b"\x89PNG-fake"


def test_a_single_variant_keeps_the_plain_filename(monkeypatch):
    """1장만 받을 때는 예전과 같은 다운로드 이름이어야 한다."""
    fake, _ = _fake_edit()
    monkeypatch.setattr(svc, "edit_and_resize", fake)

    result, _ = _run(1)

    assert [v.filename for v in result.variants] == ["edited_img.jpg"]


# ── 돌발 예외 격리 ───────────────────────────────────────────────────────────

def test_an_unexpected_exception_is_contained_as_a_single_failure(monkeypatch):
    """ImageEditError 가 아닌 예외도 그 시안 한 장의 실패로 가둬야 한다.

    실제로 겪은 경로: 안전 정책 거부 응답이 AttributeError 로 새어 나와 gather 가
    통째로 던졌고, 성공했을 시안까지 전부 버려진 채 라우터의 일반 422 가 됐다
    (2026-11-28, 저작권 캐릭터 이미지). 원인 예외가 무엇이든 재발하면 안 된다.
    """
    calls = {"n": 0}

    def flaky(**kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise AttributeError("'NoneType' object has no attribute 'parts'")
        import io
        from app.services.token_usage import TokenUsage
        return (
            io.BytesIO(b"\x89PNG-fake"), "edited_img.jpg", "image/jpeg", "Gemini (test)",
            TokenUsage.of(prompt=10, output=20),
        )

    monkeypatch.setattr(svc, "edit_and_resize", flaky)

    result, _ = _run(3)

    assert len(result.variants) == 2
    assert result.failed == 1
