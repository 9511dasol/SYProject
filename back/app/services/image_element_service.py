"""이미지 요소 분석 — Gemini Vision 으로 광고 이미지 속 구성 요소를 찾아낸다.

업로드된 완성 이미지(PSD/레이어 없음)에서 텍스트·로고·제품·인물·배경 같은
요소를 bounding box 와 함께 추출한다. 프런트는 이 박스를 이미지 위에 겹쳐 그려
사용자가 "클릭으로 수정할 요소를 특정"할 수 있게 한다 — 자유 프롬프트만으로
"왼쪽 위의 문구"를 설명하게 하는 것보다 지시가 훨씬 정확해진다.

좌표는 0~1 비율(x, y, w, h)로 돌려준다 — 분석은 축소 썸네일로 하지만 비율
좌표라 원본 크기 그대로 매핑된다.
"""

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

from app.core.settings import settings
from app.services.genai_options import build_genai_client
from app.services.image_util import make_thumbnail_jpeg
from app.services.llm_json import parse_json_object, strip_code_fence
from app.services.token_usage import TokenUsage

_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise ImageAnalyzeError("GEMINI_API_KEY가 설정되지 않았습니다.")
        _client = build_genai_client(settings.GEMINI_API_KEY)
    return _client


class ImageAnalyzeError(Exception):
    """요소 분석 실패 (API 키 미설정, 응답 파싱 실패 등)."""


# ── 응답 모델 ─────────────────────────────────────────────────────────────────

class ElementBox(BaseModel):
    """0~1 비율 좌표 — 프런트가 CSS 퍼센트로 바로 쓸 수 있는 형태."""
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(gt=0.0, le=1.0)
    h: float = Field(gt=0.0, le=1.0)


class ImageElement(BaseModel):
    id: int
    label: str          # "헤드라인 문구", "제품(화장품 용기)" 같은 짧은 한국어 이름
    category: str       # text | logo | product | person | background | graphic | other
    box: ElementBox


class ElementAnalysis(BaseModel):
    elements: list[ImageElement]


# ── 분석 ──────────────────────────────────────────────────────────────────────

_MAX_ELEMENTS = 12
_THUMBNAIL_BOX = (1024, 1024)

_SYSTEM_PROMPT = f"""당신은 광고 이미지 분석 전문가입니다.
주어진 이미지에서 편집 대상이 될 만한 구성 요소를 찾아 JSON 으로만 응답하세요.

규칙:
- 요소는 최대 {_MAX_ELEMENTS}개. 중요한 것부터 (헤드라인 > 제품/인물 > 로고 > 버튼/뱃지 > 보조 문구 > 배경).
- label 은 사용자가 바로 알아볼 짧은 한국어 이름 (예: "헤드라인 문구", "제품 사진", "브랜드 로고", "할인율 뱃지", "배경").
- category 는 text | logo | product | person | background | graphic | other 중 하나.
- box_2d 는 [ymin, xmin, ymax, xmax], 각 값은 0~1000 정수 (이미지 비율 기준).
- 배경은 전체를 덮더라도 하나의 요소로 포함하세요.

응답 형식:
{{"elements": [{{"id": 1, "label": "...", "category": "...", "box_2d": [ymin, xmin, ymax, xmax]}}]}}"""


def _thumbnail(file_bytes: bytes) -> bytes:
    """분석용 축소본 — 비율 좌표를 쓰므로 원본 매핑에 영향 없다.

    투명 영역은 흰색으로 합성한다. 예전에는 RGB 로 변환만 해서 PIL 기본값인
    검정으로 깔렸고, 모델이 어두운 배경 위 요소로 잘못 읽을 수 있었다.
    """
    return make_thumbnail_jpeg(file_bytes, _THUMBNAIL_BOX)


def _parse_response(raw: str) -> ElementAnalysis:
    cleaned = strip_code_fence(raw)
    data = parse_json_object(raw, error=ImageAnalyzeError, excerpt=200)

    items = data.get("elements")
    if not isinstance(items, list):
        raise ImageAnalyzeError(f"AI 응답 형식이 예상과 다릅니다: {cleaned[:200]!r}")

    elements: list[ImageElement] = []
    for i, item in enumerate(items[:_MAX_ELEMENTS], start=1):
        box = item.get("box_2d")
        if not (isinstance(box, list) and len(box) == 4):
            continue
        try:
            ymin, xmin, ymax, xmax = (max(0.0, min(1.0, float(v) / 1000.0)) for v in box)
        except (TypeError, ValueError):
            continue
        if xmax <= xmin or ymax <= ymin:
            continue
        try:
            elements.append(ImageElement(
                id=i,
                label=str(item.get("label") or f"요소 {i}").strip()[:40],
                category=str(item.get("category") or "other").strip() or "other",
                box=ElementBox(x=xmin, y=ymin, w=xmax - xmin, h=ymax - ymin),
            ))
        except ValidationError:
            continue

    if not elements:
        raise ImageAnalyzeError("이미지에서 편집할 요소를 찾지 못했습니다. 다른 이미지로 시도해 주세요.")
    return ElementAnalysis(elements=elements)


async def analyze_elements(file_bytes: bytes) -> tuple[ElementAnalysis, TokenUsage | None]:
    """이미지 속 요소 목록(비율 박스 포함)과 토큰 사용량을 반환."""
    thumb = _thumbnail(file_bytes)
    try:
        response = await _gemini().aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=thumb, mime_type="image/jpeg"),
                "이 광고 이미지의 구성 요소를 지정된 JSON 형식으로만 분석해주세요.",
            ],
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                response_mime_type="application/json",
                # gemini-2.5 는 thinking 토큰이 출력 한도를 소모해 JSON이 중간에
                # 잘린다 (2000·4000 모두 잘렸음). 박스 탐지는 지각 작업이라
                # thinking 없이도 충분하므로 꺼서 한도를 전부 응답에 쓴다.
                thinking_config=types.ThinkingConfig(thinking_budget=0),
                max_output_tokens=4000,
            ),
        )
    except genai_errors.APIError as exc:
        raise ImageAnalyzeError(f"Gemini API 오류 ({exc.code}): {exc.message}") from exc

    return _parse_response(response.text or ""), TokenUsage.from_gemini_response(response)
