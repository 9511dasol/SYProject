"""매체 규격 일괄 리사이즈 — 소재 1장을 주요 광고 지면 크기들로 한 번에.

기존 /resize 는 지정 크기로 '늘려서' 맞추기 때문에 비율이 다른 지면에선
이미지가 찌그러졌다. 여기서는 **비율을 유지한 중앙 크롭(cover)** 으로 채워
왜곡 없이 규격을 맞춘다. AI 를 쓰지 않는 순수 Pillow 경로라 과금이 없다.

(비율 차이가 큰 띠배너 등에서 크롭 대신 AI 아웃페인팅으로 캔버스를 채우는
전략은 이미지 생성 모델 쿼터 확보 후의 확장 지점 — docs/imagefactory-research.md)
"""

import io
import zipfile

from PIL import Image
from pydantic import BaseModel

from app.services.image_resize_service import _PIL_FORMAT, _SAVE_KWARGS


class MediaPreset(BaseModel):
    key: str
    media: str    # 그룹 라벨 (Meta, Google, Naver, Kakao, YouTube)
    label: str
    width: int
    height: int


# 국내 퍼포먼스 마케팅에서 수요가 많은 지면 순 — 키는 다운로드 파일명에도 쓰인다
MEDIA_PRESETS: list[MediaPreset] = [
    MediaPreset(key="meta_feed_square",   media="Meta",    label="피드 1:1",        width=1080, height=1080),
    MediaPreset(key="meta_feed_vertical", media="Meta",    label="피드 4:5",        width=1080, height=1350),
    MediaPreset(key="meta_story",         media="Meta",    label="스토리·릴스 9:16", width=1080, height=1920),
    MediaPreset(key="google_display",     media="Google",  label="디스플레이 1.91:1", width=1200, height=628),
    MediaPreset(key="google_square",      media="Google",  label="디스플레이 1:1",   width=1200, height=1200),
    MediaPreset(key="youtube_thumbnail",  media="YouTube", label="썸네일 16:9",      width=1280, height=720),
    MediaPreset(key="naver_mobile_da",    media="Naver",   label="모바일 DA",        width=1250, height=560),
    MediaPreset(key="kakao_bizboard",     media="Kakao",   label="비즈보드",         width=1029, height=258),
]

_PRESET_BY_KEY = {p.key: p for p in MEDIA_PRESETS}


class UnknownPresetError(Exception):
    pass


def cover_resize(img: Image.Image, width: int, height: int) -> Image.Image:
    """비율 유지 + 중앙 크롭으로 목표 크기를 가득 채운다 (CSS object-fit: cover).

    늘려 맞추기(stretch)와 달리 피사체가 찌그러지지 않는다. 대신 목표 비율이
    원본과 많이 다르면 가장자리가 잘린다 — 핵심 요소가 중앙에 있는 광고
    소재에서 가장 무난한 기본값이다.
    """
    src_w, src_h = img.size
    scale = max(width / src_w, height / src_h)
    scaled_w, scaled_h = max(1, round(src_w * scale)), max(1, round(src_h * scale))
    resized = img.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)

    left = (scaled_w - width) // 2
    top = (scaled_h - height) // 2
    return resized.crop((left, top, left + width, top + height))


def _flatten_for(fmt: str, img: Image.Image) -> Image.Image:
    """JPEG 출력 시 알파를 흰 배경에 합성 — 기존 /resize 와 같은 규칙."""
    if fmt == "jpeg" and img.mode in ("RGBA", "PA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        mask = img.split()[-1] if img.mode in ("RGBA", "PA", "LA") else None
        bg.paste(img.convert("RGBA") if img.mode == "PA" else img, mask=mask)
        return bg
    if fmt != "png" and img.mode not in ("RGB", "RGBA", "L", "LA"):
        return img.convert("RGB")
    return img


def batch_resize_zip(
    file_bytes: bytes,
    original_filename: str,
    preset_keys: list[str],
    output_format: str = "jpeg",
) -> tuple[io.BytesIO, str, str]:
    """선택한 프리셋들로 변환한 이미지를 zip 으로 묶어 돌려준다.

    Returns
    -------
    (zip_buffer, download_filename, content_type)
    """
    presets = []
    for key in preset_keys:
        preset = _PRESET_BY_KEY.get(key)
        if preset is None:
            raise UnknownPresetError(f"알 수 없는 규격입니다: {key}")
        presets.append(preset)

    fmt = output_format.lower()
    ext = "jpg" if fmt == "jpeg" else fmt
    pil_fmt = _PIL_FORMAT.get(fmt, "JPEG")
    save_kwargs = _SAVE_KWARGS.get(fmt, {})

    img = Image.open(io.BytesIO(file_bytes))
    img.load()
    img = _flatten_for(fmt, img)

    stem = original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for preset in presets:
            out = io.BytesIO()
            cover_resize(img, preset.width, preset.height).save(out, format=pil_fmt, **save_kwargs)
            zf.writestr(f"{stem}_{preset.key}_{preset.width}x{preset.height}.{ext}", out.getvalue())

    zip_buf.seek(0)
    return zip_buf, f"{stem}_media_sizes.zip", "application/zip"


__all__ = [
    "MEDIA_PRESETS",
    "MediaPreset",
    "UnknownPresetError",
    "batch_resize_zip",
    "cover_resize",
]
