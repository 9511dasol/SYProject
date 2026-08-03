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

Platform breakdown and style guide — these lengths apply to the "text" field only:
- Instagram (4 headings): Ultra-short, punchy, include 1-2 relevant emoji, emotional & visual, under 20 Korean characters
- Blog (3 headings): SEO-friendly, keyword-rich, descriptive, informative tone, 20-40 Korean characters
- YouTube (3 headings): Curiosity-driven, use numbers/questions/surprises for high CTR, 20-35 Korean characters

The "desc" field is separate and must be substantially longer than the heading itself:
- Write 2 natural sentences totalling about 85 Korean characters — usually 80-95.
- That range is a guideline, not a hard limit. Landing a few characters outside it is
  fine when it makes the sentence read better, and you should never pad with filler or
  chop a sentence short just to hit a number. But do not habitually run past ~95
  characters: two compact sentences, not two sprawling ones.
- Sentence 1: what in the image the heading picks up on, and which audience it targets.
  Sentence 2: why it works on that platform.
- Never repeat the heading verbatim.
- The same length applies to all three platforms — only the "text" field differs by platform.

Examples of well-sized desc values (83 characters each — aim for this scale, not this wording):
- "이미지의 50% 할인 문구를 전면에 내세워 가격에 민감한 수험생을 겨냥했습니다. 짧고 강한 표현이라 피드를 빠르게 넘기다가도 시선을 멈추게 만듭니다."
- "이미지 속 D-7 마감 압박을 그대로 살려 지금 결정해야 할 이유를 만들었습니다. 목표가 뚜렷한 수험생에게 잘 통하고 클릭까지 자연스럽게 이어집니다."

STRICT OUTPUT RULES:
1. Respond ONLY with valid JSON — no markdown, no code block, no extra text whatsoever.
2. ALL text and desc fields must be in Korean.
3. Generate headings in this exact order: Instagram × 4, Blog × 3, YouTube × 3.
4. Use this EXACT JSON schema (id starts at 1, increments by 1):
{"headings": [{"id": 1, "platform": "Instagram", "text": "...", "desc": "이 문구를 추천하는 이유를 85자 내외 두 문장으로"}, ...]}
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


# desc 길이 보정 — 프롬프트만으로는 한글 글자 수가 잡히지 않는다.
# 같은 지시로 여러 번 돌려도 평균이 78~121자로 흔들려서(모델이 글자를 못 셈),
# 눈에 띄게 긴 것만 문장 경계에서 되돌린다. 문장 중간을 자르는 일은 없다.
_DESC_TARGET = 85
_DESC_MAX = 110              # 이 이하는 "85자 내외"로 보고 그대로 둔다
_DESC_MIN_AFTER_TRIM = 60    # 잘라낸 결과가 이보다 짧아지면 차라리 원문을 쓴다

_SENTENCE_END = re.compile(r'(?<=[.!?])\s+')


def _fit_desc(desc: str) -> str:
    """지나치게 길게 나온 desc 를 문장 단위로만 줄여 목표(85자)에 가깝게 되돌린다.

    _DESC_MAX 이하면 손대지 않는다 — 90자든 105자든 "85자 내외"의 범위이고,
    자연스러운 문장을 건드릴 이유가 없다.

    줄일 때는 앞 문장부터 이어 붙이다가 한도를 넘기 직전까지만 남긴다. 한 문장짜리라
    자를 지점이 없거나 남는 게 너무 짧아지면 원문을 그대로 돌려준다 — 어색하게 잘린
    문장보다 조금 긴 문장이 낫다.
    """
    desc = desc.strip()
    if len(desc) <= _DESC_MAX:
        return desc

    sentences = _SENTENCE_END.split(desc)
    if len(sentences) < 2:
        return desc

    kept = ""
    for sentence in sentences:
        candidate = f"{kept} {sentence}".strip() if kept else sentence
        if kept and len(candidate) > _DESC_MAX:
            break
        kept = candidate

    return kept if len(kept) >= _DESC_MIN_AFTER_TRIM else desc


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
        if isinstance(item.get("desc"), str):
            item["desc"] = _fit_desc(item["desc"])
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
                # desc 를 85자로 늘리면서 함께 올렸다. 10개 × (제목 ~35자 + 내용 ~85자)에
                # JSON 구조까지 더하면 예전 한도(2500)로는 응답이 중간에 잘려
                # "JSON이 잘려 파싱할 수 없습니다" 로 떨어진다. 실제 사용한 토큰만
                # 과금되므로 한도를 넉넉히 두는 쪽이 안전하다.
                max_output_tokens=4000,
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
