"""LangGraph 기반 멀티스텝 이미지 필터 그래프

흐름:
  [initial_screen]  Gemini — confidence 포함 1차 판단
      ├─ confidence ≥ 0.75, pass=True  →  [finalize]                     (fast_pass)
      ├─ confidence ≥ 0.75, pass=False →  [generate_suggestions]         (fast_fail)
      └─ confidence < 0.75 (borderline) → [deep_analysis] Gemini (심층)
              ├─ pass=True  →  [finalize]                                 (deep_pass)
              └─ pass=False →  [generate_suggestions] → [finalize]        (deep_fail)

단순 pass/fail 단일 호출에서 → 신뢰도 기반 동적 라우팅 + 거절 시 개선 제안 생성으로 개선.

※ 임시 조치: OpenAI/Claude 대신 Gemini(GEMINI_API_KEY)를 단일 프로바이더로 사용.
"""

import base64
import json
from typing import Literal, TypedDict

from google import genai
from google.genai import types
from langgraph.graph import END, StateGraph

from app.core.settings import settings

# ── 상수 ──────────────────────────────────────────────────────────────────────

_MODEL                = settings.GEMINI_MODEL
_CONFIDENCE_THRESHOLD = 0.75

# ── 지연 초기화 클라이언트 ─────────────────────────────────────────────────────

_gemini_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_client


# ── State ─────────────────────────────────────────────────────────────────────

class ImageFilterState(TypedDict):
    thumbnail_b64:  str
    condition:      str
    # initial_screen 결과
    initial_pass:   bool
    confidence:     float
    initial_reason: str
    # deep_analysis 결과 (borderline 시만 채워짐)
    deep_pass:      bool | None
    deep_reason:    str | None
    # generate_suggestions 결과 (거절 시만 채워짐)
    suggestions:    list[str]
    # finalize 결과
    final_pass:     bool
    final_reason:   str
    provider_label: str
    analysis_path:  str  # fast_pass | fast_fail | deep_pass | deep_fail


# ── 프롬프트 ──────────────────────────────────────────────────────────────────

_INITIAL_SYSTEM = (
    "You are a professional image analysis AI.\n"
    "Determine whether the image satisfies the user's condition.\n\n"
    "Rules:\n"
    "1. Respond ONLY with a valid JSON object — no markdown, no extra text.\n"
    '2. Schema: {"pass": bool, "confidence": float, "reason": "<Korean 1-2 sentences>"}\n'
    "3. confidence: your certainty level (0.0–1.0).\n"
    "   0.9+ = very certain  |  0.65-0.9 = fairly sure  |  < 0.65 = borderline/uncertain\n"
    "4. reason: written in Korean, concise.\n"
    "5. If borderline, reflect uncertainty in confidence — do NOT force pass=false."
)

_DEEP_SYSTEM = (
    "You are an expert image analysis AI performing a careful second-opinion evaluation.\n"
    "The previous AI was uncertain. Be thorough and give a definitive answer.\n\n"
    "Rules:\n"
    "1. Respond ONLY with valid JSON — no markdown.\n"
    '2. Schema: {"pass": bool, "confidence": float, "reason": "<Korean 2-3 sentences>"}\n'
    "3. reason: written in Korean, detailed explanation of your conclusion."
)

_SUGGEST_SYSTEM = (
    "You are a helpful image consultant.\n"
    "An image was rejected. Provide specific, actionable suggestions in Korean.\n\n"
    "Rules:\n"
    "1. Respond ONLY with valid JSON — no markdown.\n"
    '2. Schema: {"suggestions": ["제안1", "제안2", "제안3"]}\n'
    "3. Exactly 2-3 suggestions in Korean.\n"
    "4. Be concrete: what specific change to make, or what kind of image would pass instead."
)


# ── 노드 ──────────────────────────────────────────────────────────────────────

async def initial_screen_node(state: ImageFilterState) -> dict:
    """Gemini — confidence 포함 1차 스크리닝."""
    try:
        resp = await _gemini().aio.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(
                    data=base64.b64decode(state["thumbnail_b64"]),
                    mime_type="image/jpeg",
                ),
                f"정제 조건: {state['condition']}\n\n조건 충족 여부를 판별해주세요.",
            ],
            config=types.GenerateContentConfig(
                system_instruction=_INITIAL_SYSTEM,
                response_mime_type="application/json",
                max_output_tokens=300,
                temperature=0,
            ),
        )
        result: dict = json.loads(resp.text or "{}")
    except (json.JSONDecodeError, Exception):
        result = {}

    return {
        "initial_pass":   bool(result.get("pass", False)),
        "confidence":     float(result.get("confidence", 0.5)),
        "initial_reason": str(result.get("reason", "")),
    }


async def deep_analysis_node(state: ImageFilterState) -> dict:
    """Gemini — borderline 케이스 심층 분석."""
    prev_context = f"\n이전 AI 판단: {state['initial_reason']}" if state.get("initial_reason") else ""
    try:
        resp = await _gemini().aio.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(
                    data=base64.b64decode(state["thumbnail_b64"]),
                    mime_type="image/jpeg",
                ),
                (
                    f"정제 조건: {state['condition']}{prev_context}\n\n"
                    "이 이미지의 조건 충족 여부를 심층 분석해주세요."
                ),
            ],
            config=types.GenerateContentConfig(
                system_instruction=_DEEP_SYSTEM,
                response_mime_type="application/json",
                max_output_tokens=400,
            ),
        )
        result: dict = json.loads(resp.text or "{}")
    except (json.JSONDecodeError, Exception):
        result = {}

    return {
        "deep_pass":   bool(result.get("pass", False)),
        "deep_reason": str(result.get("reason", "")),
    }


async def generate_suggestions_node(state: ImageFilterState) -> dict:
    """Gemini — 거절 이유 기반 이미지 개선 제안 생성."""
    rejection_reason = state.get("deep_reason") or state.get("initial_reason", "")
    try:
        resp = await _gemini().aio.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(
                    data=base64.b64decode(state["thumbnail_b64"]),
                    mime_type="image/jpeg",
                ),
                (
                    f"정제 조건: {state['condition']}\n"
                    f"거절 이유: {rejection_reason}\n\n"
                    "이 이미지가 조건을 통과하려면 구체적으로 어떻게 해야 할지 제안해주세요."
                ),
            ],
            config=types.GenerateContentConfig(
                system_instruction=_SUGGEST_SYSTEM,
                response_mime_type="application/json",
                max_output_tokens=400,
            ),
        )
        result: dict = json.loads(resp.text or "{}")
        raw_list = result.get("suggestions", [])
        suggestions = [str(s) for s in raw_list[:3]] if isinstance(raw_list, list) else []
    except (json.JSONDecodeError, Exception):
        suggestions = []

    return {"suggestions": suggestions}


def finalize_node(state: ImageFilterState) -> dict:
    """최종 결과 집계 — deep_analysis 사용 여부에 따라 결과 소스 결정."""
    used_deep = state.get("deep_pass") is not None

    if used_deep:
        final_pass   = bool(state["deep_pass"])
        final_reason = state.get("deep_reason") or state.get("initial_reason", "")
        provider     = f"Gemini ({_MODEL}, deep)"
        path         = "deep_pass" if final_pass else "deep_fail"
    else:
        final_pass   = state["initial_pass"]
        final_reason = state.get("initial_reason", "")
        provider     = f"Gemini ({_MODEL})"
        path         = "fast_pass" if final_pass else "fast_fail"

    return {
        "final_pass":     final_pass,
        "final_reason":   final_reason,
        "provider_label": provider,
        "analysis_path":  path,
    }


# ── 라우팅 ────────────────────────────────────────────────────────────────────

def _route_initial(
    state: ImageFilterState,
) -> Literal["finalize", "deep_analysis", "generate_suggestions"]:
    """confidence 기준으로 빠른 결정 vs 심층 분석 분기."""
    if state["confidence"] >= _CONFIDENCE_THRESHOLD:
        return "finalize" if state["initial_pass"] else "generate_suggestions"
    return "deep_analysis"


def _route_deep(
    state: ImageFilterState,
) -> Literal["finalize", "generate_suggestions"]:
    return "finalize" if state.get("deep_pass") else "generate_suggestions"


# ── 그래프 컴파일 ──────────────────────────────────────────────────────────────

_builder = StateGraph(ImageFilterState)

_builder.add_node("initial_screen",       initial_screen_node)
_builder.add_node("deep_analysis",        deep_analysis_node)
_builder.add_node("generate_suggestions", generate_suggestions_node)
_builder.add_node("finalize",             finalize_node)

_builder.set_entry_point("initial_screen")

_builder.add_conditional_edges(
    "initial_screen",
    _route_initial,
    {
        "finalize":             "finalize",
        "deep_analysis":        "deep_analysis",
        "generate_suggestions": "generate_suggestions",
    },
)
_builder.add_conditional_edges(
    "deep_analysis",
    _route_deep,
    {
        "finalize":             "finalize",
        "generate_suggestions": "generate_suggestions",
    },
)
_builder.add_edge("generate_suggestions", "finalize")
_builder.add_edge("finalize", END)

image_filter_graph = _builder.compile()


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

async def run_filter_graph(
    thumbnail_b64: str,
    condition: str,
) -> tuple[bool, str, str, list[str], str]:
    """그래프를 실행하고 최종 판별 결과를 반환합니다.

    Returns
    -------
    (final_pass, final_reason, provider_label, suggestions, analysis_path)
    """
    initial_state: ImageFilterState = {
        "thumbnail_b64":  thumbnail_b64,
        "condition":      condition,
        "initial_pass":   False,
        "confidence":     0.0,
        "initial_reason": "",
        "deep_pass":      None,
        "deep_reason":    None,
        "suggestions":    [],
        "final_pass":     False,
        "final_reason":   "",
        "provider_label": "",
        "analysis_path":  "",
    }
    result = await image_filter_graph.ainvoke(initial_state)
    return (
        result["final_pass"],
        result["final_reason"],
        result["provider_label"],
        result.get("suggestions", []),
        result["analysis_path"],
    )
