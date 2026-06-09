"""LangGraph 기반 멀티스텝 이미지 필터 그래프

흐름:
  [initial_screen]  GPT-4o-mini — confidence 포함 1차 판단
      ├─ confidence ≥ 0.75, pass=True  →  [finalize]                     (fast_pass)
      ├─ confidence ≥ 0.75, pass=False →  [generate_suggestions]         (fast_fail)
      └─ confidence < 0.75 (borderline) → [deep_analysis] Claude Sonnet
              ├─ pass=True  →  [finalize]                                 (deep_pass)
              └─ pass=False →  [generate_suggestions] → [finalize]        (deep_fail)

단순 pass/fail 단일 호출에서 → 신뢰도 기반 동적 라우팅 + 거절 시 개선 제안 생성으로 개선.
"""

import json
import os
from typing import Literal, TypedDict

import anthropic
from langgraph.graph import END, StateGraph
from openai import AsyncOpenAI

# ── 상수 ──────────────────────────────────────────────────────────────────────

_OPENAI_MODEL          = "gpt-4o-mini"
_CLAUDE_MODEL          = "claude-3-5-sonnet-20241022"
_CONFIDENCE_THRESHOLD  = 0.75

# ── 지연 초기화 클라이언트 ─────────────────────────────────────────────────────

_openai_client: AsyncOpenAI | None                   = None
_anthropic_client: anthropic.AsyncAnthropic | None   = None


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
    """GPT-4o-mini — confidence 포함 1차 스크리닝."""
    try:
        resp = await _openai().chat.completions.create(
            model=_OPENAI_MODEL,
            response_format={"type": "json_object"},
            max_tokens=300,
            temperature=0,
            messages=[
                {"role": "system", "content": _INITIAL_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{state['thumbnail_b64']}",
                                "detail": "low",
                            },
                        },
                        {
                            "type": "text",
                            "text": f"정제 조건: {state['condition']}\n\n조건 충족 여부를 판별해주세요.",
                        },
                    ],
                },
            ],
        )
        result: dict = json.loads(resp.choices[0].message.content or "{}")
    except (json.JSONDecodeError, Exception):
        result = {}

    return {
        "initial_pass":   bool(result.get("pass", False)),
        "confidence":     float(result.get("confidence", 0.5)),
        "initial_reason": str(result.get("reason", "")),
    }


async def deep_analysis_node(state: ImageFilterState) -> dict:
    """Claude Sonnet — borderline 케이스 심층 분석."""
    prev_context = f"\n이전 AI 판단: {state['initial_reason']}" if state.get("initial_reason") else ""
    try:
        resp = await _anthropic_c().messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=400,
            system=_DEEP_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": state["thumbnail_b64"],
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                f"정제 조건: {state['condition']}{prev_context}\n\n"
                                "이 이미지의 조건 충족 여부를 심층 분석해주세요."
                            ),
                        },
                    ],
                },
                {"role": "assistant", "content": "{"},
            ],
        )
        raw = "{" + (resp.content[0].text if resp.content else "}")
        result: dict = json.loads(raw)
    except (json.JSONDecodeError, Exception):
        result = {}

    return {
        "deep_pass":   bool(result.get("pass", False)),
        "deep_reason": str(result.get("reason", "")),
    }


async def generate_suggestions_node(state: ImageFilterState) -> dict:
    """Claude — 거절 이유 기반 이미지 개선 제안 생성."""
    rejection_reason = state.get("deep_reason") or state.get("initial_reason", "")
    try:
        resp = await _anthropic_c().messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=400,
            system=_SUGGEST_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": state["thumbnail_b64"],
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                f"정제 조건: {state['condition']}\n"
                                f"거절 이유: {rejection_reason}\n\n"
                                "이 이미지가 조건을 통과하려면 구체적으로 어떻게 해야 할지 제안해주세요."
                            ),
                        },
                    ],
                },
                {"role": "assistant", "content": "{"},
            ],
        )
        raw = "{" + (resp.content[0].text if resp.content else "}")
        result: dict = json.loads(raw)
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
        provider     = "Claude Sonnet"
        path         = "deep_pass" if final_pass else "deep_fail"
    else:
        final_pass   = state["initial_pass"]
        final_reason = state.get("initial_reason", "")
        provider     = "GPT-4o-mini"
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
