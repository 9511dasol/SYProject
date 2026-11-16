"""PIL 이미지 처리에서 반복되던 규칙을 한곳에 모은다.

알파 채널을 흰 배경에 합성하는 분기가 네 곳(리사이즈·매체 프리셋·헤딩 썸네일·
요소 분석 썸네일)에 복제돼 있었고, 조금씩 달랐다.

- 헤딩 썸네일은 PA(팔레트+알파)의 알파를 마스크로 쓰지 않아 투명 처리가 빠졌다.
- 요소 분석 썸네일은 합성 없이 RGB 로 변환해서, 투명한 부분이 **검게** 깔렸다
  (PIL 은 알파를 버릴 때 검정으로 합성한다) — 같은 이미지를 올려도 기능마다
  다른 그림을 보게 된다.

규칙을 하나로 모아 "투명한 곳은 흰색"으로 통일한다.
"""

import io

from PIL import Image

WHITE = (255, 255, 255)

# 알파를 들고 있을 수 있는 모드. P(팔레트)는 투명 인덱스를 가질 수 있어 포함한다.
_ALPHA_MODES = ("RGBA", "PA", "LA", "P")

# JPEG 가 아닌 포맷에서 그대로 저장할 수 있는 모드
_DIRECT_SAVE_MODES = ("RGB", "RGBA", "L", "LA")


def flatten_to_rgb(img: Image.Image, background: tuple[int, int, int] = WHITE) -> Image.Image:
    """알파를 배경색에 합성해 RGB 로 만든다. 알파가 없으면 RGB 로 변환만 한다."""
    if img.mode in _ALPHA_MODES:
        if img.mode == "P":
            img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, background)
        mask = img.split()[-1] if img.mode in ("RGBA", "PA", "LA") else None
        bg.paste(img.convert("RGBA") if img.mode == "PA" else img, mask=mask)
        return bg
    return img if img.mode == "RGB" else img.convert("RGB")


def flatten_for_format(
    img: Image.Image, fmt: str, background: tuple[int, int, int] = WHITE
) -> Image.Image:
    """출력 포맷이 알파를 못 담으면 합성한다. PNG·WebP 는 투명도를 그대로 둔다."""
    if fmt == "jpeg" and img.mode in _ALPHA_MODES:
        return flatten_to_rgb(img, background)
    if fmt != "png" and img.mode not in _DIRECT_SAVE_MODES:
        return img.convert("RGB")
    return img


def make_thumbnail_jpeg(
    file_bytes: bytes, box: tuple[int, int], quality: int = 85
) -> bytes:
    """업로드 바이트 → 흰 배경에 합성한 축소 JPEG 바이트.

    AI 에 넘길 축소본을 만드는 용도라 포맷은 항상 JPEG 이다.
    """
    img = Image.open(io.BytesIO(file_bytes))
    img.load()  # 원본 버퍼 의존성 해제
    img = flatten_to_rgb(img, WHITE)
    img.thumbnail(box, Image.Resampling.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue()
