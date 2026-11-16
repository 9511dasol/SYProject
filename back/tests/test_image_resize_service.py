"""이미지 리사이즈 — 한 기능 전체가 이 함수 하나에 올라가 있는데 테스트가 없었다.

목표 크기 계산(한쪽만 줬을 때의 비율 보정), 포맷별 저장, 파일명 조립, AI 업스케일
폴백이 모두 여기서 끝난다. 특히 폴백은 "AI 가 실패해도 조용히 기존 경로로 떨어진다"는
약속이라, 깨지면 사용자는 리사이즈 자체가 실패한 것으로 본다.

Gemini 는 호출하지 않는다 — ai_upscale 을 대역으로 갈아 끼운다.
"""

import io

import pytest
from PIL import Image

from app.services import image_resize_service as svc
from app.services.image_ai_edit_service import ImageGenResult
from app.services.image_resize_service import resize_image
from app.services.token_usage import TokenUsage


def _png(width: int, height: int, colour=(10, 120, 200)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buf, format="PNG")
    return buf.getvalue()


def _transparent_png(size=(40, 40)) -> bytes:
    img = Image.new("RGBA", size, (255, 0, 0, 255))
    for x in range(size[0] // 2, size[0]):
        for y in range(size[1]):
            img.putpixel((x, y), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _opened(buf: io.BytesIO) -> Image.Image:
    img = Image.open(buf)
    img.load()
    return img


# ── 목표 크기 계산 ───────────────────────────────────────────────────────────


def test_both_dimensions_are_used_as_given():
    buf, *_ = resize_image(_png(800, 600), "a.png", 200, 100, "png")
    assert _opened(buf).size == (200, 100)


def test_width_only_keeps_the_aspect_ratio():
    """한쪽만 주면 나머지를 비율로 채운다 — 800x600(4:3) → 400 이면 300."""
    buf, *_ = resize_image(_png(800, 600), "a.png", 400, None, "png")
    assert _opened(buf).size == (400, 300)


def test_height_only_keeps_the_aspect_ratio():
    buf, *_ = resize_image(_png(800, 600), "a.png", None, 150, "png")
    assert _opened(buf).size == (200, 150)


def test_no_dimensions_keeps_the_original_size():
    buf, *_ = resize_image(_png(640, 480), "a.png", None, None, "png")
    assert _opened(buf).size == (640, 480)


def test_extreme_ratio_never_collapses_to_zero():
    """반올림이 0 이 되면 PIL 이 터진다 — 최소 1px 로 막아야 한다."""
    buf, *_ = resize_image(_png(1000, 10), "a.png", 5, None, "png")
    width, height = _opened(buf).size
    assert width == 5 and height >= 1


# ── 포맷·파일명 ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("fmt", "pil_format", "content_type", "ext"),
    [
        ("jpeg", "JPEG", "image/jpeg", "jpg"),
        ("png", "PNG", "image/png", "png"),
        ("webp", "WEBP", "image/webp", "webp"),
    ],
)
def test_output_format_filename_and_content_type(fmt, pil_format, content_type, ext):
    buf, name, ctype, _, _ = resize_image(_png(100, 50), "소재.png", 20, 10, fmt)

    assert _opened(buf).format == pil_format
    assert ctype == content_type
    assert name == f"소재_resized_20x10.{ext}"


def test_filename_without_extension_is_handled():
    _, name, *_ = resize_image(_png(10, 10), "확장자없음", 5, 5, "png")
    assert name == "확장자없음_resized_5x5.png"


def test_filename_keeps_only_the_last_extension():
    _, name, *_ = resize_image(_png(10, 10), "a.b.png", 5, 5, "png")
    assert name == "a.b_resized_5x5.png"


def test_jpeg_output_flattens_transparency_to_white():
    """JPEG 는 알파를 담지 못한다 — 검정으로 깔리면 소재가 망가져 보인다."""
    buf, *_ = resize_image(_transparent_png((40, 40)), "a.png", 40, 40, "jpeg")
    img = _opened(buf)

    assert img.mode == "RGB"
    r, g, b = img.getpixel((35, 5))
    assert (r, g, b) == pytest.approx((255, 255, 255), abs=10)


def test_png_output_keeps_transparency():
    buf, *_ = resize_image(_transparent_png((40, 40)), "a.png", 20, 20, "png")
    assert _opened(buf).mode in ("RGBA", "LA", "P")


# ── AI 업스케일 ──────────────────────────────────────────────────────────────


def test_upscale_is_not_called_when_shrinking(monkeypatch):
    """축소는 보간으로 충분하다 — 쓸데없이 토큰을 쓰면 안 된다."""
    calls = []
    monkeypatch.setattr(svc, "ai_upscale", lambda *a, **k: calls.append(1))

    _, _, _, used, usage = resize_image(_png(800, 600), "a.png", 100, 75, "png", use_ai_upscale=True)

    assert calls == [] and used is False and usage is None


def test_upscale_runs_when_enlarging(monkeypatch):
    bigger = _png(1600, 1200, colour=(0, 200, 0))
    monkeypatch.setattr(
        svc, "ai_upscale",
        lambda *a, **k: ImageGenResult(image_bytes=bigger, usage=TokenUsage.of(10, 20)),
    )

    buf, _, _, used, usage = resize_image(
        _png(400, 300), "a.png", 1600, 1200, "png", use_ai_upscale=True
    )

    assert used is True
    assert usage is not None and usage.total_tokens == 30
    assert _opened(buf).size == (1600, 1200)


def test_upscale_is_skipped_when_not_requested(monkeypatch):
    monkeypatch.setattr(svc, "ai_upscale", lambda *a, **k: pytest.fail("호출되면 안 된다"))
    _, _, _, used, _ = resize_image(_png(100, 100), "a.png", 400, 400, "png")
    assert used is False


def test_falls_back_quietly_when_upscale_returns_nothing(monkeypatch):
    """키 미설정·응답 오류 — 리사이즈 자체는 성공해야 한다."""
    monkeypatch.setattr(svc, "ai_upscale", lambda *a, **k: None)

    buf, _, _, used, usage = resize_image(
        _png(100, 100), "a.png", 400, 400, "png", use_ai_upscale=True
    )

    assert used is False and usage is None
    assert _opened(buf).size == (400, 400)   # LANCZOS 경로로 떨어졌다


def test_falls_back_quietly_when_upscale_returns_garbage(monkeypatch):
    """이미지가 아닌 바이트가 와도 원본으로 계속 간다."""
    monkeypatch.setattr(
        svc, "ai_upscale",
        lambda *a, **k: ImageGenResult(image_bytes=b"not-an-image", usage=TokenUsage.of(1, 1)),
    )

    buf, _, _, used, _ = resize_image(
        _png(100, 100), "a.png", 400, 400, "png", use_ai_upscale=True
    )

    assert used is False
    assert _opened(buf).size == (400, 400)
