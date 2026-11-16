"""투명 이미지를 어떤 기능에 넣어도 같은 그림이 나와야 한다.

알파 합성 분기가 네 곳에 복제돼 있었고 서로 달랐다 — 헤딩 썸네일은 PA(팔레트+알파)의
알파를 마스크로 쓰지 않았고, 요소 분석 썸네일은 합성 없이 RGB 로 변환해 투명한 부분이
**검게** 깔렸다(PIL 은 알파를 버릴 때 검정으로 합성한다). 모델이 보는 그림이 달라지는
차이라, 규칙을 한곳에 모은 뒤 "투명한 곳은 흰색"을 고정한다.
"""

import io

import pytest
from PIL import Image

from app.services.image_util import flatten_for_format, flatten_to_rgb, make_thumbnail_jpeg

RED = (255, 0, 0)
WHITE = (255, 255, 255)


def _transparent_png(size=(40, 40)) -> bytes:
    """왼쪽 절반은 빨강(불투명), 오른쪽 절반은 완전 투명한 PNG."""
    img = Image.new("RGBA", size, (*RED, 255))
    half = size[0] // 2
    for x in range(half, size[0]):
        for y in range(size[1]):
            img.putpixel((x, y), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _load(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img


# ── 합성 규칙 ────────────────────────────────────────────────────────────────


def test_transparent_area_becomes_white_not_black():
    """가장 중요한 지점 — 예전 요소 분석 경로는 여기서 검정이 나왔다."""
    img = _load(_transparent_png())
    flat = flatten_to_rgb(img)

    assert flat.mode == "RGB"
    assert flat.getpixel((5, 5)) == RED       # 불투명한 쪽은 그대로
    assert flat.getpixel((35, 5)) == WHITE    # 투명한 쪽은 흰색


def test_palette_with_alpha_keeps_transparency():
    """PA 모드의 알파도 마스크로 써야 한다 — 헤딩 썸네일 경로에 빠져 있던 처리."""
    rgba = _load(_transparent_png())
    pa = rgba.convert("PA")

    flat = flatten_to_rgb(pa)
    assert flat.getpixel((35, 5)) == WHITE


def test_opaque_image_is_unchanged():
    img = Image.new("RGB", (10, 10), RED)
    assert flatten_to_rgb(img).getpixel((0, 0)) == RED


def test_background_colour_is_configurable():
    img = _load(_transparent_png())
    flat = flatten_to_rgb(img, background=(0, 0, 255))
    assert flat.getpixel((35, 5)) == (0, 0, 255)


# ── 포맷별 분기 ──────────────────────────────────────────────────────────────


def test_png_output_keeps_alpha():
    """PNG 는 투명도를 담을 수 있으므로 합성하면 안 된다."""
    img = _load(_transparent_png())
    assert flatten_for_format(img, "png").mode == "RGBA"


def test_jpeg_output_flattens_alpha():
    img = _load(_transparent_png())
    out = flatten_for_format(img, "jpeg")
    assert out.mode == "RGB"
    assert out.getpixel((35, 5)) == WHITE


def test_webp_output_keeps_alpha():
    """WebP 도 알파를 담는다 — RGBA 는 그대로 통과시킨다."""
    img = _load(_transparent_png())
    assert flatten_for_format(img, "webp").mode == "RGBA"


def test_unsupported_mode_is_converted_for_non_png():
    """CMYK 처럼 그대로 저장할 수 없는 모드는 RGB 로 바꾼다."""
    img = Image.new("CMYK", (10, 10))
    assert flatten_for_format(img, "jpeg").mode == "RGB"
    assert flatten_for_format(img, "webp").mode == "RGB"


# ── 썸네일 ───────────────────────────────────────────────────────────────────


def test_thumbnail_is_jpeg_within_the_box():
    data = make_thumbnail_jpeg(_transparent_png((800, 600)), (512, 512))
    img = _load(data)

    assert img.format == "JPEG"
    assert img.width <= 512 and img.height <= 512
    assert img.width > img.height  # 가로 비율 유지


def test_thumbnail_flattens_transparency_to_white():
    data = make_thumbnail_jpeg(_transparent_png((200, 200)), (100, 100))
    img = _load(data)

    r, g, b = img.getpixel((img.width - 5, 5))
    assert (r, g, b) == pytest.approx((255, 255, 255), abs=8)  # JPEG 손실 허용
