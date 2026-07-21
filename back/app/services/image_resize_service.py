"""메모리 기반 이미지 리사이즈 서비스 (Pillow · 디스크 저장 없음)."""

import io

from PIL import Image

from app.services.image_ai_edit_service import ai_upscale

# 출력 포맷별 Content-Type 매핑
_CONTENT_TYPES: dict[str, str] = {
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
}

# Pillow 저장 시 포맷 이름 (PIL 규칙: 대문자)
_PIL_FORMAT: dict[str, str] = {
    "jpeg": "JPEG",
    "png":  "PNG",
    "webp": "WEBP",
}

# 포맷별 저장 옵션 (화질 최대화)
_SAVE_KWARGS: dict[str, dict] = {
    "jpeg": {"quality": 95, "optimize": True, "subsampling": 0},
    "png":  {"optimize": True, "compress_level": 6},
    "webp": {"quality": 95, "method": 4},
}


def resize_image(
    file_bytes: bytes,
    original_filename: str,
    target_width: int | None,
    target_height: int | None,
    output_format: str = "jpeg",
    use_ai_upscale: bool = False,
) -> tuple[io.BytesIO, str, str, bool]:
    """
    Returns
    -------
    (buffer, download_filename, content_type, ai_upscale_used)
    """
    fmt = output_format.lower()

    # ── 이미지 로드 ──────────────────────────────────────────────
    buf_in = io.BytesIO(file_bytes)
    img: Image.Image = Image.open(buf_in)
    img.load()  # 완전히 디코딩해 buf_in 의존성 제거

    orig_w, orig_h = img.size

    # ── 목표 크기 계산 (한쪽 값만 전달될 경우 비율 보정) ──────────
    if target_width and target_height:
        new_w, new_h = target_width, target_height
    elif target_width:
        new_w = target_width
        new_h = max(1, round(target_width * orig_h / orig_w))
    elif target_height:
        new_h = target_height
        new_w = max(1, round(target_height * orig_w / orig_h))
    else:
        new_w, new_h = orig_w, orig_h

    # ── 확대 시 AI 업스케일 시도 (요청 시) ─────────────────────────
    # LANCZOS는 보간일 뿐이라 목표 크기가 원본보다 크면 디테일을 못 살린다.
    # 실패하면(키 미설정·응답 오류 등) 조용히 기존 LANCZOS 경로로 폴백한다.
    ai_upscale_used = False
    if use_ai_upscale and new_w * new_h > orig_w * orig_h:
        src_buf = io.BytesIO()
        img.save(src_buf, format="PNG")
        ai_bytes = ai_upscale(src_buf.getvalue(), mime_type="image/png")
        if ai_bytes:
            try:
                ai_img = Image.open(io.BytesIO(ai_bytes))
                ai_img.load()
                img = ai_img
                ai_upscale_used = True
            except Exception:
                pass  # 디코딩 실패 시 원본 img 유지

    # ── JPEG 출력 시 알파 채널 처리 (흰 배경 합성) ───────────────
    if fmt == "jpeg" and img.mode in ("RGBA", "PA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        mask = img.split()[-1] if img.mode in ("RGBA", "PA", "LA") else None
        bg.paste(img.convert("RGBA") if img.mode == "PA" else img, mask=mask)
        img = bg
    elif fmt != "png" and img.mode not in ("RGB", "RGBA", "L", "LA"):
        img = img.convert("RGB")

    # ── LANCZOS 리샘플링으로 리사이즈 ────────────────────────────
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # ── 메모리 버퍼에 저장 ────────────────────────────────────────
    buf_out = io.BytesIO()
    pil_fmt = _PIL_FORMAT.get(fmt, "JPEG")
    save_kwargs = _SAVE_KWARGS.get(fmt, {})
    resized.save(buf_out, format=pil_fmt, **save_kwargs)
    buf_out.seek(0)

    # ── 다운로드 파일명 생성 ──────────────────────────────────────
    stem = original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename
    ext = "jpg" if fmt == "jpeg" else fmt
    download_name = f"{stem}_resized_{new_w}x{new_h}.{ext}"
    content_type = _CONTENT_TYPES.get(fmt, "application/octet-stream")

    return buf_out, download_name, content_type, ai_upscale_used
