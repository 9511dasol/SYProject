"""AI 기반 이미지 정제 + 리사이즈 서비스 — 다중 AI 제공자 라우팅

조건 복잡도를 휴리스틱으로 판별한 뒤 적합한 AI 모델로 자동 라우팅합니다:

  simple  → OpenAI   gpt-4o-mini                  (OPENAI_API_KEY)
  complex → Anthropic claude-3-5-sonnet-20241022   (ANTHROPIC_API_KEY)  ← 기본값
         or Google   gemini-1.5-flash              (GEMINI_API_KEY)

  COMPLEX_AI_PROVIDER 환경변수로 복잡 조건 AI를 지정합니다 (기본: "claude").
  허용값: "claude" | "gemini"
"""

import base64
import io
import json
import os
from typing import Literal

import anthropic
from openai import AsyncOpenAI
from PIL import Image

from app.services.image_resize_service import resize_image

# ── 환경 설정 ──────────────────────────────────────────────────────────────────

_COMPLEX_PROVIDER: Literal["claude", "gemini"] = (
    os.getenv("COMPLEX_AI_PROVIDER", "claude").strip().lower()  # type: ignore[assignment]
)

_OPENAI_MODEL  = "gpt-4o-mini"
_CLAUDE_MODEL  = "claude-3-5-sonnet-20241022"
_GEMINI_MODEL  = "gemini-1.5-flash"
_THUMBNAIL_BOX = (512, 512)

_SYSTEM_PROMPT = (
    "You are a professional image analysis AI. "
    "Your only task is to determine whether the given image satisfies the user's condition.\n\n"
    "Rules:\n"
    "1. Respond ONLY with a valid JSON object — no markdown, no code block, no extra text.\n"
    "2. Use this exact schema:\n"
    '   {"pass": true, "reason": "<Korean explanation>"}\n'
    '   or\n'
    '   {"pass": false, "reason": "<Korean explanation>"}\n'
    "3. The 'reason' field must be written in Korean and be concise (1–2 sentences).\n"
    "4. Be strict: if you are uncertain, set pass=false."
)

# ── 예외 ──────────────────────────────────────────────────────────────────────

class FilterRejectError(Exception):
    """AI 판별 결과 조건 불일치."""
    def __init__(self, reason: str, provider: str) -> None:
        super().__init__(reason)
        self.reason   = reason
        self.provider = provider


# ── 지연 초기화 클라이언트 ─────────────────────────────────────────────────────
# 사용 시점에 환경변수를 읽어 초기화 — 서버 시작 시 키가 없어도 임포트 가능

_openai_client: AsyncOpenAI | None             = None
_anthropic_client: anthropic.AsyncAnthropic | None = None
_gemini_configured: bool                        = False


def _openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
        _openai_client = AsyncOpenAI(api_key=key)
    return _openai_client


def _anthropic_c() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.")
        _anthropic_client = anthropic.AsyncAnthropic(api_key=key)
    return _anthropic_client


def _ensure_gemini() -> None:
    """Gemini API 키를 최초 1회 구성. google-generativeai 패키지 필요."""
    global _gemini_configured
    if _gemini_configured:
        return
    try:
        import google.generativeai as genai  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError(
            "google-generativeai 패키지가 없습니다. `uv add google-generativeai` 를 실행하세요."
        ) from exc
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
    genai.configure(api_key=key)
    _gemini_configured = True


# ── 복잡도 분류 ────────────────────────────────────────────────────────────────
# 점수 2점 이상 → complex, 미만 → simple
#   +2 : 길이 60자 초과
#   +1 : 길이 40~60자
#   +2 : 추상적·심미적 키워드 1개 이상
#   +1 : 다중 조건 연결어 1개 이상

_ABSTRACT_KW = frozenset([
    "미학", "분위기", "감성", "세련", "고급", "아름다운", "예쁜",
    "자연스러운", "조화", "균형", "품질", "인상적", "감동",
    "느낌", "스타일", "톤", "색감", "무드", "컨셉", "브랜드", "마케팅",
    "전문적", "비즈니스", "구도", "배치", "레이아웃", "비율", "구성",
    "밸런스", "심미", "독창", "창의", "예술적",
])

_MULTI_KW = frozenset([
    "없고", "있고", "없으며", "있으며", "이며", "이고",
    "그리고", "또한", "동시에", "뿐만 아니라", "이면서",
])


def _classify(condition: str) -> Literal["simple", "complex"]:
    score = 0
    n = len(condition)
    if n > 60:
        score += 2
    elif n > 40:
        score += 1
    if any(kw in condition for kw in _ABSTRACT_KW):
        score += 2
    if any(kw in condition for kw in _MULTI_KW):
        score += 1
    return "complex" if score >= 2 else "simple"


# ── 썸네일 생성 ───────────────────────────────────────────────────────────────

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


# ── Provider 구현 ──────────────────────────────────────────────────────────────

async def _call_openai_mini(thumbnail_b64: str, condition: str) -> tuple[bool, str]:
    """OpenAI GPT-4o-mini — 단순 조건 판별."""
    resp = await _openai().chat.completions.create(
        model=_OPENAI_MODEL,
        response_format={"type": "json_object"},
        max_tokens=256,
        temperature=0,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{thumbnail_b64}",
                            "detail": "low",
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"정제 조건: {condition}\n\n"
                            "위 조건을 기준으로 이 이미지의 통과 여부를 판별해주세요."
                        ),
                    },
                ],
            },
        ],
    )
    raw = resp.choices[0].message.content or "{}"
    result: dict = json.loads(raw)
    return bool(result.get("pass", False)), str(result.get("reason", ""))


async def _call_claude_sonnet(thumbnail_b64: str, condition: str) -> tuple[bool, str]:
    """Anthropic Claude Sonnet — 고차원 조건 판별."""
    resp = await _anthropic_c().messages.create(
        model=_CLAUDE_MODEL,
        max_tokens=300,
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": thumbnail_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"정제 조건: {condition}\n\n"
                            "위 조건을 기준으로 이 이미지의 통과 여부를 판별해주세요."
                        ),
                    },
                ],
            },
            # prefill: Claude가 반드시 JSON 객체로 시작하도록 강제
            {"role": "assistant", "content": "{"},
        ],
    )
    # prefill "{" 는 응답 텍스트에 포함되지 않으므로 직접 앞에 붙임
    raw = "{" + (resp.content[0].text if resp.content else "}")
    result: dict = json.loads(raw)
    return bool(result.get("pass", False)), str(result.get("reason", ""))


async def _call_gemini_flash(thumbnail_b64: str, condition: str) -> tuple[bool, str]:
    """Google Gemini 1.5 Flash — 고차원 조건 판별 (대안)."""
    _ensure_gemini()
    import google.generativeai as genai  # noqa: PLC0415

    model = genai.GenerativeModel(
        _GEMINI_MODEL,
        system_instruction=_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.0,
            max_output_tokens=256,
        ),
    )

    # Base64 → PIL Image (Gemini SDK는 PIL Image를 직접 수용)
    pil_img = Image.open(io.BytesIO(base64.b64decode(thumbnail_b64)))

    resp = await model.generate_content_async([
        pil_img,
        f"정제 조건: {condition}\n\n위 조건을 기준으로 이 이미지의 통과 여부를 판별해주세요.",
    ])

    raw = resp.text or "{}"
    result: dict = json.loads(raw)
    return bool(result.get("pass", False)), str(result.get("reason", ""))


# ── 라우팅 테이블 ──────────────────────────────────────────────────────────────

_PROVIDER_LABEL = {
    "openai-mini": f"GPT-4o-mini",
    "claude":      f"Claude Sonnet",
    "gemini":      f"Gemini 1.5 Flash",
}

_COMPLEX_CALL = {
    "claude": _call_claude_sonnet,
    "gemini": _call_gemini_flash,
}


async def _call_vision(thumbnail_b64: str, condition: str) -> tuple[bool, str, str]:
    """복잡도 분류 → 적합한 Provider 선택 → 호출. (pass, reason, provider_label) 반환."""
    if _classify(condition) == "simple":
        provider_key = "openai-mini"
        call_fn      = _call_openai_mini
    else:
        provider_key = _COMPLEX_PROVIDER if _COMPLEX_PROVIDER in _COMPLEX_CALL else "claude"
        call_fn      = _COMPLEX_CALL[provider_key]

    label = _PROVIDER_LABEL[provider_key]

    try:
        passed, reason = await call_fn(thumbnail_b64, condition)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"[{label}] AI 응답 JSON 파싱 실패: {exc}") from exc
    except anthropic.APIError as exc:
        raise RuntimeError(f"[{label}] Anthropic API 오류: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"[{label}] AI 호출 실패: {exc}") from exc

    return passed, reason, label


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

async def analyze_and_resize(
    file_bytes: bytes,
    original_filename: str,
    condition: str,
    target_width: int | None,
    target_height: int | None,
    output_format: str = "jpeg",
) -> tuple[io.BytesIO, str, str, str, str]:
    """
    Returns
    -------
    (buffer, download_filename, content_type, ai_reason, ai_provider_label)

    Raises
    ------
    FilterRejectError  — AI 조건 불일치
    RuntimeError       — API / 이미지 처리 오류
    """
    thumbnail_b64 = _make_thumbnail_b64(file_bytes)
    passed, reason, provider_label = await _call_vision(thumbnail_b64, condition)

    if not passed:
        raise FilterRejectError(reason, provider_label)

    buf, download_name, content_type = resize_image(
        file_bytes=file_bytes,
        original_filename=original_filename,
        target_width=target_width,
        target_height=target_height,
        output_format=output_format,
    )

    return buf, download_name, content_type, reason, provider_label
