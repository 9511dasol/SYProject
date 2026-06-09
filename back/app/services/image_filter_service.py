"""AI 기반 이미지 정제 + 리사이즈 서비스 — LangGraph 파이프라인

비전 분석은 image_filter_graph 의 LangGraph 그래프에 위임합니다:
  simple(확신) → GPT-4o-mini 1회 호출
  borderline   → GPT-4o-mini + Claude Sonnet 심층 분석
  거절         → Claude Sonnet 개선 제안 자동 생성
"""

import base64
import io

from PIL import Image

from app.services.image_filter_graph import run_filter_graph
from app.services.image_resize_service import resize_image

# ── 예외 ──────────────────────────────────────────────────────────────────────

class FilterRejectError(Exception):
    """AI 판별 결과 조건 불일치."""
    def __init__(self, reason: str, provider: str, suggestions: list[str]) -> None:
        super().__init__(reason)
        self.reason      = reason
        self.provider    = provider
        self.suggestions = suggestions


# ── 썸네일 생성 ───────────────────────────────────────────────────────────────

_THUMBNAIL_BOX = (512, 512)


def _make_thumbnail_b64(file_bytes: bytes) -> str:
    """원본 이미지를 512×512 이내로 리샘플링 → JPEG Base64 반환 (메모리 내 처리)."""
    buf = io.BytesIO(file_bytes)
    img: Image.Image = Image.open(buf)
    img.load()

    if img.mode in ("RGBA", "PA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        mask = img.split()[-1] if img.mode in ("RGBA", "LA") else None
        bg.paste(img.convert("RGBA") if img.mode == "PA" else img, mask=mask)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img.thumbnail(_THUMBNAIL_BOX, Image.Resampling.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85, optimize=True)
    out.seek(0)
    return base64.b64encode(out.read()).decode("utf-8")


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

async def analyze_and_resize(
    file_bytes:       bytes,
    original_filename: str,
    condition:        str,
    target_width:     int | None,
    target_height:    int | None,
    output_format:    str = "jpeg",
) -> tuple[io.BytesIO, str, str, str, str]:
    """
    Returns
    -------
    (buffer, download_filename, content_type, ai_reason, ai_provider_label)

    Raises
    ------
    FilterRejectError  — AI 조건 불일치 (suggestions 포함)
    RuntimeError       — API / 이미지 처리 오류
    """
    thumbnail_b64 = _make_thumbnail_b64(file_bytes)

    try:
        passed, reason, provider_label, suggestions, _ = await run_filter_graph(
            thumbnail_b64, condition
        )
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"AI 필터 그래프 오류: {exc}") from exc

    if not passed:
        raise FilterRejectError(reason, provider_label, suggestions)

    buf, download_name, content_type = resize_image(
        file_bytes=file_bytes,
        original_filename=original_filename,
        target_width=target_width,
        target_height=target_height,
        output_format=output_format,
    )

    return buf, download_name, content_type, reason, provider_label
