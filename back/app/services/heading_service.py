"""AI 기반 마케팅 헤딩 문구 생성 서비스.

처리 흐름:
  1. 원본 이미지 → 512×512 JPEG 썸네일 (메모리 내)
  2. 썸네일 → Google Gemini Vision (GEMINI_API_KEY)
  3. 응답 JSON 파싱 + 마크다운 제거 + Pydantic 검증
  4. HeadingResponse 반환
"""

import re
from typing import NamedTuple

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.core.settings import settings
from app.schemas.heading_schema import HeadingResponse
from app.services.genai_options import build_genai_client
from app.services.image_util import make_thumbnail_jpeg
from app.services.llm_json import parse_json_object, strip_code_fence
from app.services.token_usage import TokenUsage

# ── 클라이언트 (지연 초기화) ──────────────────────────────────────────────────

_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
        _client = build_genai_client(settings.GEMINI_API_KEY)
    return _client


# ── 상수 ──────────────────────────────────────────────────────────────────────

_MODEL          = settings.GEMINI_MODEL
_THUMBNAIL_BOX  = (512, 512)
_MAX_ATTEMPTS   = 2     # 목표 미달/파싱 실패 시 재시도 횟수

# 플랫폼별 생성 개수·스타일 지침의 단일 출처.
# 예전에는 "EXACTLY 10"·"Instagram (4 headings)" 같은 숫자가 프롬프트 문자열과
# _TARGET_COUNT 상수에 각자 하드코딩돼 있어, 개수를 바꾸면 한쪽을 빠뜨려 조용히
# 어긋날 수 있었다. 이제 프롬프트·목표치·플랫폼 순서가 전부 여기서 파생된다.
#
# 2026-11-27: 두 번째 필드가 "추천 이유"에서 "본문 카피"로 바뀌었다. 담당자가
# 실제로 필요한 건 게시물에 붙일 글인데, 이유는 한 번 읽으면 끝나는 정보라
# 카드 면적만 차지하고 복사 대상도 아니었다. 본문은 매체마다 쓰임이 달라
# (피드 캡션 / 검색 도입 문단 / 설명란 첫 줄) 길이·형식을 스펙에 함께 둔다.


class PlatformSpec(NamedTuple):
    count:       int
    title_style: str
    body_style:  str
    #: 본문이 이 길이를 넘으면 문장 경계에서 되돌린다 (_fit_body)
    body_max:    int


_PLATFORM_SPECS: dict[str, PlatformSpec] = {
    "Instagram": PlatformSpec(
        4,
        "Ultra-short, punchy, include 1-2 relevant emoji, emotional & visual, under 20 Korean characters",
        "Feed caption: 2-3 sentences, 60-120 Korean characters, then 3-5 hashtags on the last line. "
        "Only the first ~2 lines show before '...more', so put the hook in sentence 1. "
        "Hashtags are for search reach and are not counted in the 60-120 range.",
        150,
    ),
    "Blog": PlatformSpec(
        3,
        "SEO-friendly, keyword-rich, descriptive, informative tone, 20-40 Korean characters",
        "Opening paragraph of the post: 2-3 sentences, 100-150 Korean characters, no hashtags. "
        "This is the intro only, not the whole post. Search results truncate it, "
        "so lead with the keyword.",
        185,
    ),
    "YouTube": PlatformSpec(
        3,
        "Curiosity-driven, use numbers/questions/surprises for high CTR, 20-35 Korean characters",
        "First 2 lines of the description box: 2 sentences, 60-100 Korean characters, no hashtags. "
        "Only ~70 characters show before the fold, so the reason to click must land inside them.",
        125,
    ),
}
PLATFORM_ORDER: tuple[str, ...] = tuple(_PLATFORM_SPECS)
_TARGET_COUNT = sum(spec.count for spec in _PLATFORM_SPECS.values())

_PROMPT_BODY = """\
Each heading has two parts, and BOTH are copy the marketer will publish as-is:
- "text" is the headline (length/style per platform above).
- "body" is the copy that goes with it — the caption, intro paragraph, or description
  that the headline sits on top of. Write it for the reader, not about the headline.

Rules for "body":
- Follow the per-platform body spec above for length and format.
- Do NOT explain, justify, or describe the headline. Never write about "this heading"
  or why it works — that is not what the field is for.
- Do not repeat the headline verbatim; carry its promise forward instead.
- The length ranges are guidelines, not hard limits. A few characters outside is fine
  when it reads better, but never pad with filler to hit a number.

Example of the relationship between the two fields (format and length still follow
the platform spec above — this pair is only showing what "body" is for):
- text: "마감 D-7, 50% 할인"
- body: "수능까지 남은 시간, 교재값까지 고민할 여유는 없죠. 지금 등록하면 전 과목 패키지를 반값에 들을 수 있어요. 마감은 이번 주 일요일까지입니다."

Note how the body speaks to the reader and carries the offer forward. It does not say
anything like "이 문구는 긴급성을 강조합니다" — that would be describing the headline.
"""


def _build_system_prompt(platform: str | None = None) -> str:
    """전체(기본) 또는 단일 플랫폼용 시스템 프롬프트를 스펙에서 조립한다."""
    specs = {platform: _PLATFORM_SPECS[platform]} if platform else _PLATFORM_SPECS
    total = sum(spec.count for spec in specs.values())
    platform_phrase = f"{len(specs)} platform" + ("s" if len(specs) > 1 else "")
    breakdown = "\n".join(
        f"- {name} ({spec.count} headings): {spec.title_style}" for name, spec in specs.items()
    )
    body_breakdown = "\n".join(f"- {name}: {spec.body_style}" for name, spec in specs.items())
    order = ", ".join(f"{name} × {spec.count}" for name, spec in specs.items())
    first_platform = next(iter(specs))

    return f"""\
You are a world-class Korean marketing copywriter specializing in digital advertising.

Analyze the provided image and generate EXACTLY {total} compelling Korean marketing heading suggestions for {platform_phrase}.

Platform breakdown and style guide — these lengths apply to the "text" field only:
{breakdown}

Body copy spec per platform — these apply to the "body" field:
{body_breakdown}

{_PROMPT_BODY}
STRICT OUTPUT RULES:
1. Respond ONLY with valid JSON — no markdown, no code block, no extra text whatsoever.
2. ALL text and body fields must be in Korean.
3. Generate headings in this exact order: {order}.
4. Every item MUST include a non-empty "body".
5. Use this EXACT JSON schema (id starts at 1, increments by 1):
{{"headings": [{{"id": 1, "platform": "{first_platform}", "text": "...", "body": "게시물에 그대로 올릴 본문 카피"}}, ...]}}
"""


# ── 썸네일 생성 ───────────────────────────────────────────────────────────────

def _make_thumbnail_bytes(file_bytes: bytes) -> bytes:
    return make_thumbnail_jpeg(file_bytes, _THUMBNAIL_BOX)


# 본문 길이 보정 — 프롬프트만으로는 한글 글자 수가 잡히지 않는다.
# 같은 지시로 여러 번 돌려도 모델이 글자를 못 세서 분량이 흔들리므로, 눈에 띄게
# 긴 것만 문장 경계에서 되돌린다. 문장 중간을 자르는 일은 없다.
#
# 한도는 매체마다 다르다(_PLATFORM_SPECS.body_max) — 유튜브 설명란 두 줄과
# 블로그 도입 문단을 같은 자로 재면 한쪽이 반드시 어색해진다.
_BODY_MIN_AFTER_TRIM = 60    # 잘라낸 결과가 이보다 짧아지면 차라리 원문을 쓴다

_SENTENCE_END = re.compile(r'(?<=[.!?])\s+')

# 인스타그램 본문의 마지막 줄에 붙는 해시태그. 프롬프트가 모델에게 "해시태그는
# 60~120자 범위에 포함하지 않는다"고 지시하므로, 길이 한도도 같은 기준으로 재야
# 한다. 포함해서 재면 여유가 30자(150-120)뿐이라 해시태그 5개(30자를 쉽게 넘는다)가
# 통째로 잘려 나갔다 — 모델은 지시대로 답했는데 보정이 조용히 지우는 상태였다.
_HASHTAG_LINE = re.compile(r'\n\s*(#[^\s#]+(?:\s+#[^\s#]+)*)\s*$')


def _split_hashtags(body: str) -> tuple[str, str]:
    """본문을 (산문, 해시태그 줄)로 나눈다. 해시태그가 없으면 두 번째가 빈 문자열.

    줄 전체가 해시태그로만 이뤄진 마지막 줄만 떼어 낸다. 문장 안에 섞인 해시태그는
    본문의 일부이므로 건드리지 않는다.
    """
    match = _HASHTAG_LINE.search(body)
    if match is None:
        return body, ""
    return body[: match.start()].rstrip(), match.group(1)


def _fit_body(body: str, cap: int) -> str:
    """지나치게 길게 나온 본문을 문장 단위로만 줄여 한도 안으로 되돌린다.

    cap 이하면 손대지 않는다 — 권장 범위를 조금 넘은 정도는 자연스러운 문장이고,
    건드릴 이유가 없다.

    줄일 때는 앞 문장부터 이어 붙이다가 한도를 넘기 직전까지만 남긴다. 한 문장짜리라
    자를 지점이 없거나 남는 게 너무 짧아지면 원문을 그대로 돌려준다 — 어색하게 잘린
    문장보다 조금 긴 문장이 낫다.

    **해시태그 줄은 길이 계산에서 제외하고, 잘릴 때도 그대로 남긴다.** 해시태그는
    분량이 아니라 검색 유입 장치이고, 프롬프트도 그렇게 지시한다. 산문만 줄인 뒤
    해시태그를 다시 붙인다.
    """
    body = body.strip()
    prose, hashtags = _split_hashtags(body)
    if len(prose) <= cap:
        return body  # 해시태그까지 원문 그대로

    sentences = _SENTENCE_END.split(prose)
    if len(sentences) < 2:
        return body

    kept = ""
    for sentence in sentences:
        candidate = f"{kept} {sentence}".strip() if kept else sentence
        if kept and len(candidate) > cap:
            break
        kept = candidate

    if len(kept) < _BODY_MIN_AFTER_TRIM:
        return body
    return f"{kept}\n{hashtags}" if hashtags else kept


def _parse_response(
    raw: str, *, target: int = _TARGET_COUNT, platform: str | None = None
) -> HeadingResponse:
    """AI 응답 텍스트 → HeadingResponse (엄격 검증)."""
    cleaned = strip_code_fence(raw)
    data = parse_json_object(cleaned, error=RuntimeError, excerpt=300)

    if not isinstance(data.get("headings"), list):
        raise RuntimeError(f"AI 응답 형식이 예상과 다릅니다: {cleaned[:300]!r}")

    headings = data["headings"]
    # 단일 플랫폼 요청인데 모델이 다른 플랫폼을 섞어 보내면 요청한 것만 남긴다 —
    # 섞인 채 레코드에 병합되면 같은 플랫폼 문구가 중복으로 쌓인다.
    if platform is not None:
        headings = [h for h in headings if isinstance(h, dict) and h.get("platform") == platform]

    # 목표 초과 시 앞에서부터 자르고, id 자동 보정 (AI가 id 를 잘못 반환한 경우 대비)
    headings = headings[:target]
    for i, item in enumerate(headings, start=1):
        item["id"] = i
        spec = _PLATFORM_SPECS.get(item.get("platform")) if isinstance(item, dict) else None
        body = item.get("body") if isinstance(item, dict) else None
        # body 누락은 성공으로 넘기지 않는다 — 본문 없는 문구는 쓸 데가 없고,
        # 호출부가 이 예외를 재시도로 받는다. desc 만 오던 옛 응답도 여기서 걸린다.
        if not isinstance(body, str) or not body.strip():
            raise RuntimeError(f"AI 응답에 body 가 없습니다: {str(item)[:200]!r}")
        if spec is not None:
            item["body"] = _fit_body(body, spec.body_max)
    data["headings"] = headings

    from pydantic import ValidationError
    try:
        return HeadingResponse.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(f"AI 응답 형식 오류: {exc}") from exc


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

class HeadingGenerationError(RuntimeError):
    """모든 시도가 실패했지만 그 사이 토큰이 과금된 경우.

    파싱 실패는 Gemini 호출 자체는 성공한 뒤에 일어나므로 토큰은 이미 쓴 상태다.
    예외로 끝나는 경로에서도 라우터가 usage 를 기록할 수 있어야
    ai_tool_usage_logs 합계 기반 월간 예산이 실소비와 어긋나지 않는다.
    """

    def __init__(self, message: str, usage: TokenUsage | None = None):
        super().__init__(message)
        self.usage = usage


def _add_usage(acc: TokenUsage | None, extra: TokenUsage | None) -> TokenUsage | None:
    if acc is None:
        return extra
    if extra is None:
        return acc
    return TokenUsage(
        prompt_tokens=(acc.prompt_tokens or 0) + (extra.prompt_tokens or 0),
        output_tokens=(acc.output_tokens or 0) + (extra.output_tokens or 0),
        total_tokens=(acc.total_tokens or 0) + (extra.total_tokens or 0),
    )


async def _call_gemini(
    thumbnail_bytes: bytes, platform: str | None = None
) -> tuple[str, TokenUsage | None]:
    """Gemini Vision 호출 → (원본 텍스트 응답, 토큰 사용량). API 오류는 RuntimeError로 변환."""
    target = _PLATFORM_SPECS[platform].count if platform else _TARGET_COUNT
    scope = f"{platform} 플랫폼용" if platform else "매체별"
    try:
        response = await _gemini().aio.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(data=thumbnail_bytes, mime_type="image/jpeg"),
                (
                    f"이 이미지에 어울리는 {scope} 마케팅 헤딩 문구 {target}개를 "
                    "지정된 JSON 형식으로만 생성해주세요."
                ),
            ],
            config=types.GenerateContentConfig(
                system_instruction=_build_system_prompt(platform),
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
    platform: str | None = None,
) -> tuple[HeadingResponse, TokenUsage | None, bytes]:
    """
    이미지를 분석해 플랫폼별 헤딩 문구를 생성합니다.

    platform 을 주면 그 플랫폼의 스펙 개수만(예: Instagram 4개), 없으면 전체
    (_TARGET_COUNT 개)를 목표로 합니다. 응답이 목표치에 못 미치거나 파싱에
    실패하면 최대 _MAX_ATTEMPTS 회 재시도하고, 그래도 부족하면 그때까지 얻은
    결과 중 가장 많은 것을 반환합니다 (완전 실패는 모든 시도에서 파싱조차
    되지 않았을 때만 발생).

    Returns
    -------
    (HeadingResponse, token_usage, thumbnail_bytes)
      - token_usage: 모든 시도의 합산 사용량 (버려진 재시도 포함 — 전부 실제로 과금됐다)
      - thumbnail_bytes: AI에 전달한 512×512 JPEG 썸네일 (히스토리 저장용)

    Raises
    ------
    HeadingGenerationError — 모든 시도 실패인데 과금된 호출이 있다 (usage 동봉)
    RuntimeError — 모든 시도에서 API 오류 (과금된 호출 없음)
    """
    if platform is not None and platform not in _PLATFORM_SPECS:
        raise ValueError(f"지원하지 않는 플랫폼: {platform!r}")

    target = _PLATFORM_SPECS[platform].count if platform else _TARGET_COUNT
    thumbnail_bytes = _make_thumbnail_bytes(file_bytes)

    best: HeadingResponse | None = None
    total_usage: TokenUsage | None = None
    last_error: RuntimeError | None = None

    for _ in range(_MAX_ATTEMPTS):
        try:
            raw_text, usage = await _call_gemini(thumbnail_bytes, platform)
        except RuntimeError as exc:
            last_error = exc
            continue

        # 호출이 성공한 순간 토큰은 이미 과금됐다. 파싱 실패나 목표 미달로
        # 버려지는 시도도 합산해야 로그 합계 기반 월간 예산이 실소비와 맞는다
        # (예전에는 채택된 시도 1건만 반환해 재시도분이 집계에서 샜다).
        total_usage = _add_usage(total_usage, usage)

        try:
            result = _parse_response(raw_text, target=target, platform=platform)
        except RuntimeError as exc:
            last_error = exc
            continue

        if len(result.headings) >= target:
            return result, total_usage, thumbnail_bytes
        if best is None or len(result.headings) > len(best.headings):
            best = result

    if best is not None:
        return best, total_usage, thumbnail_bytes

    assert last_error is not None
    if total_usage is not None:
        raise HeadingGenerationError(str(last_error), usage=total_usage) from last_error
    raise last_error


def merge_platform_headings(
    existing: list[dict], new_items: list[dict], platform: str
) -> list[dict]:
    """기존 기록의 한 플랫폼 문구만 새 것으로 교체한 목록을 돌려준다.

    순서는 항상 _PLATFORM_SPECS 선언 순(Instagram → Blog → YouTube)으로 맞추고
    id 를 1부터 다시 매긴다 — 재생성을 반복해도 화면·기록의 순서가 흔들리지 않는다.
    """
    merged: list[dict] = []
    for name in _PLATFORM_SPECS:
        if name == platform:
            merged.extend(new_items)
        else:
            merged.extend(h for h in existing if h.get("platform") == name)
    return [{**h, "id": i} for i, h in enumerate(merged, start=1)]
