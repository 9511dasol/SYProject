"""AI 기반 마케팅 헤딩 문구 생성 서비스.

처리 흐름:
  1. 원본 이미지 → 512×512 JPEG 썸네일 (메모리 내)
  2. 썸네일 Base64 → Anthropic Claude Vision (ANTHROPIC_API_KEY)
  3. 응답 JSON 파싱 + 마크다운 제거 + Pydantic 검증
  4. HeadingResponse 반환
"""

import base64
import io
import json
import os
import re

import anthropic
from PIL import Image

from app.schemas.heading_schema import HeadingItem, HeadingResponse

# ── 클라이언트 (지연 초기화) ──────────────────────────────────────────────────

_client: anthropic.AsyncAnthropic | None = None


def _anthropic() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.")
        _client = anthropic.AsyncAnthropic(api_key=key)
    return _client


# ── 상수 ──────────────────────────────────────────────────────────────────────

_MODEL        = "claude-3-5-sonnet-20241022"
_THUMBNAIL_BOX = (512, 512)

_SYSTEM_PROMPT = """\
You are a world-class Korean marketing copywriter specializing in digital advertising.

Analyze the provided image and generate EXACTLY 10 compelling Korean marketing heading suggestions for 3 platforms.

Platform breakdown and style guide:
- Instagram (4 headings): Ultra-short, punchy, include 1-2 relevant emoji, emotional & visual, under 20 Korean characters
- Blog (3 headings): SEO-friendly, keyword-rich, descriptive, informative tone, 20-40 Korean characters
- YouTube (3 headings): Curiosity-driven, use numbers/questions/surprises for high CTR, 20-35 Korean characters

STRICT OUTPUT RULES:
1. Respond ONLY with valid JSON — no markdown, no code block, no extra text whatsoever.
2. ALL text and desc fields must be in Korean.
3. Generate headings in this exact order: Instagram × 4, Blog × 3, YouTube × 3.
4. Use this EXACT JSON schema (id starts at 1, increments by 1):
{"headings": [{"id": 1, "platform": "Instagram", "text": "...", "desc": "이 문구를 추천하는 이유"}, ...]}
"""

_PREFILL = '{"headings": ['


# ── 썸네일 생성 ───────────────────────────────────────────────────────────────

def _make_thumbnail_b64(file_bytes: bytes) -> str:
    buf = io.BytesIO(file_bytes)
    img: Image.Image = Image.open(buf)
    img.load()

    if img.mode in ("RGBA", "PA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        bg   = Image.new("RGB", img.size, (255, 255, 255))
        mask = img.split()[-1] if img.mode in ("RGBA", "LA") else None
        bg.paste(img.convert("RGBA") if img.mode == "PA" else img, mask=mask)
        img  = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img.thumbnail(_THUMBNAIL_BOX, Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85, optimize=True)
    out.seek(0)
    return base64.b64encode(out.read()).decode("utf-8")


# ── JSON 정제 + 파싱 ──────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    """마크다운 코드 블록 제거 + 앞뒤 공백 정리."""
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*\n?', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\n?```\s*$',          '', raw, flags=re.MULTILINE)
    return raw.strip()


def _parse_response(raw: str) -> HeadingResponse:
    """AI 응답 텍스트 → HeadingResponse (엄격 검증)."""
    # prefill 로 시작하는 완성된 JSON 조립
    full    = _PREFILL + raw
    cleaned = _clean_json(full)

    # 1차: 직접 파싱
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # 2차: 텍스트 안에서 JSON 객체 추출
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if not match:
            raise RuntimeError(f"AI 응답에서 JSON을 찾을 수 없습니다: {cleaned[:300]!r}")
        data = json.loads(match.group())

    # id 자동 보정 (AI가 id 를 잘못 반환한 경우 대비)
    for i, item in enumerate(data.get("headings", []), start=1):
        item["id"] = i

    from pydantic import ValidationError
    try:
        return HeadingResponse.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(f"AI 응답 형식 오류: {exc}") from exc


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

async def generate_headings(file_bytes: bytes) -> HeadingResponse:
    """
    이미지를 분석해 플랫폼별 헤딩 문구 10개를 생성합니다.

    Returns
    -------
    HeadingResponse

    Raises
    ------
    RuntimeError — API 오류 또는 응답 파싱 실패
    """
    thumbnail_b64 = _make_thumbnail_b64(file_bytes)

    try:
        response = await _anthropic().messages.create(
            model=_MODEL,
            max_tokens=1500,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type":       "base64",
                                "media_type": "image/jpeg",
                                "data":       thumbnail_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "이 이미지에 어울리는 매체별 마케팅 헤딩 문구 10개를 "
                                "지정된 JSON 형식으로만 생성해주세요."
                            ),
                        },
                    ],
                },
                # prefill: Claude가 반드시 JSON 배열로 응답 시작
                {"role": "assistant", "content": _PREFILL},
            ],
        )
    except anthropic.APIStatusError as exc:
        raise RuntimeError(f"Anthropic API 오류 ({exc.status_code}): {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise RuntimeError(f"Anthropic 연결 실패: {exc}") from exc

    raw_text = response.content[0].text if response.content else ""
    return _parse_response(raw_text)
