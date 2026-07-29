"""AI 기반 마케팅 헤딩 문구 생성 서비스.

처리 흐름:
  1. 원본 이미지 → 512×512 JPEG 썸네일 (메모리 내)
  2. 썸네일 → Google Gemini Vision (GEMINI_API_KEY)
  3. 응답 JSON 파싱 + 마크다운 제거 + Pydantic 검증
  4. HeadingResponse 반환
"""

import io
import json
import re

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from PIL import Image

from app.core.settings import settings
from app.schemas.heading_schema import HeadingResponse
from app.services.token_usage import TokenUsage

# ── 클라이언트 (지연 초기화) ──────────────────────────────────────────────────

_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


# ── 상수 ──────────────────────────────────────────────────────────────────────

_MODEL          = settings.GEMINI_MODEL
_THUMBNAIL_BOX  = (512, 512)
_MAX_ATTEMPTS   = 2     # 10개 미달/파싱 실패 시 재시도 횟수
_TARGET_COUNT   = 10

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


# ── 썸네일 생성 ───────────────────────────────────────────────────────────────

def _make_thumbnail_bytes(file_bytes: bytes) -> bytes:
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
    return out.getvalue()


# ── JSON 정제 + 파싱 ──────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    """마크다운 코드 블록 제거 + 앞뒤 공백 정리."""
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*\n?', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\n?```\s*$',          '', raw, flags=re.MULTILINE)
    return raw.strip()


def _parse_response(raw: str) -> HeadingResponse:
    """AI 응답 텍스트 → HeadingResponse (엄격 검증)."""
    cleaned = _clean_json(raw)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if not match:
            raise RuntimeError(f"AI 응답에서 JSON을 찾을 수 없습니다: {cleaned[:300]!r}")
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"AI 응답 JSON이 잘려 파싱할 수 없습니다: {cleaned[:300]!r}") from exc

    if not isinstance(data, dict) or not isinstance(data.get("headings"), list):
        raise RuntimeError(f"AI 응답 형식이 예상과 다릅니다: {cleaned[:300]!r}")

    # 10개 초과 시 앞에서부터 자르고, id 자동 보정 (AI가 id 를 잘못 반환한 경우 대비)
    headings = data["headings"][:_TARGET_COUNT]
    for i, item in enumerate(headings, start=1):
        item["id"] = i
    data["headings"] = headings

    from pydantic import ValidationError
    try:
        return HeadingResponse.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(f"AI 응답 형식 오류: {exc}") from exc


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

async def _call_gemini(thumbnail_bytes: bytes) -> tuple[str, TokenUsage | None]:
    """Gemini Vision 호출 → (원본 텍스트 응답, 토큰 사용량). API 오류는 RuntimeError로 변환."""
    try:
        response = await _gemini().aio.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(data=thumbnail_bytes, mime_type="image/jpeg"),
                (
                    "이 이미지에 어울리는 매체별 마케팅 헤딩 문구 10개를 "
                    "지정된 JSON 형식으로만 생성해주세요."
                ),
            ],
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                response_mime_type="application/json",
                max_output_tokens=2500,
            ),
        )
    except genai_errors.APIError as exc:
        raise RuntimeError(f"Gemini API 오류 ({exc.code}): {exc.message}") from exc

    return response.text or "", TokenUsage.from_gemini_response(response)


async def generate_headings(
    file_bytes: bytes,
) -> tuple[HeadingResponse, TokenUsage | None, bytes]:
    """
    이미지를 분석해 플랫폼별 헤딩 문구를 생성합니다 (목표 10개).

    응답이 목표치(10개)에 못 미치거나 파싱에 실패하면 최대 _MAX_ATTEMPTS 회
    재시도하고, 그래도 부족하면 그때까지 얻은 결과 중 가장 많은 것을 반환합니다
    (완전 실패는 모든 시도에서 파싱조차 되지 않았을 때만 발생).

    Returns
    -------
    (HeadingResponse, token_usage, thumbnail_bytes)
      - token_usage: 채택된 시도의 사용량
      - thumbnail_bytes: AI에 전달한 512×512 JPEG 썸네일 (히스토리 저장용)

    Raises
    ------
    RuntimeError — 모든 시도에서 API 오류 또는 응답 파싱 실패
    """
    thumbnail_bytes = _make_thumbnail_bytes(file_bytes)

    best: HeadingResponse | None = None
    best_usage: TokenUsage | None = None
    last_error: RuntimeError | None = None

    for _ in range(_MAX_ATTEMPTS):
        try:
            raw_text, usage = await _call_gemini(thumbnail_bytes)
            result = _parse_response(raw_text)
        except RuntimeError as exc:
            last_error = exc
            continue

        if len(result.headings) >= _TARGET_COUNT:
            return result, usage, thumbnail_bytes
        if best is None or len(result.headings) > len(best.headings):
            best = result
            best_usage = usage

    if best is not None:
        return best, best_usage, thumbnail_bytes

    assert last_error is not None
    raise last_error
