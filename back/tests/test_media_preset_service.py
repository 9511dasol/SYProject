"""매체 규격 일괄 리사이즈 — cover 크롭 기하와 zip 구성."""

import io
import zipfile

import pytest
from PIL import Image

from app.services.media_preset_service import (
    MEDIA_PRESETS,
    UnknownPresetError,
    batch_resize_zip,
    cover_resize,
)


def _png_bytes(w: int, h: int, color=(200, 50, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


# ── cover_resize ──────────────────────────────────────────────────────────────


def test_cover_fills_target_exactly():
    img = Image.new("RGB", (1200, 628))
    out = cover_resize(img, 1080, 1920)
    assert out.size == (1080, 1920)


def test_cover_keeps_aspect_by_cropping_not_stretching():
    """가로로 긴 원본 → 정사각 타깃이면 좌우가 잘려야 한다 (찌그러지면 안 된다).

    왼쪽 절반 파랑 / 오른쪽 절반 빨강인 원본을 정사각으로 바꾸면,
    중앙 크롭이라 양쪽 색이 모두 남아 있고 경계는 정중앙이어야 한다.
    """
    img = Image.new("RGB", (2000, 1000), (0, 0, 255))
    img.paste(Image.new("RGB", (1000, 1000), (255, 0, 0)), (1000, 0))

    out = cover_resize(img, 500, 500)

    assert out.size == (500, 500)
    assert out.getpixel((10, 250)) == (0, 0, 255)    # 왼쪽은 파랑
    assert out.getpixel((490, 250)) == (255, 0, 0)   # 오른쪽은 빨강


# ── batch_resize_zip ──────────────────────────────────────────────────────────


def test_zip_contains_one_file_per_preset():
    keys = ["meta_feed_square", "kakao_bizboard"]
    buf, name, content_type = batch_resize_zip(_png_bytes(1200, 628), "banner.png", keys, "jpeg")

    assert name == "banner_media_sizes.zip"
    assert content_type == "application/zip"

    with zipfile.ZipFile(buf) as zf:
        names = zf.namelist()
        assert names == [
            "banner_meta_feed_square_1080x1080.jpg",
            "banner_kakao_bizboard_1029x258.jpg",
        ]
        # 각 항목이 실제 그 크기의 이미지인지
        for preset_key, (w, h) in zip(keys, [(1080, 1080), (1029, 258)]):
            entry = next(n for n in names if preset_key in n)
            img = Image.open(io.BytesIO(zf.read(entry)))
            assert img.size == (w, h)


def test_all_presets_convert_without_error():
    buf, _, _ = batch_resize_zip(
        _png_bytes(1080, 1080), "sq.png", [p.key for p in MEDIA_PRESETS], "webp"
    )
    with zipfile.ZipFile(buf) as zf:
        assert len(zf.namelist()) == len(MEDIA_PRESETS)


def test_unknown_preset_raises():
    with pytest.raises(UnknownPresetError):
        batch_resize_zip(_png_bytes(100, 100), "x.png", ["tiktok_full"], "jpeg")
