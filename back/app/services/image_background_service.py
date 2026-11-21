"""배경 자동 제안 — 피사체는 유지하고 배경만 바꾼 시안 여러 장을 한 번에 만든다.

업로드 이미지 1장을 받아 스타일 프리셋별로 Gemini 이미지 생성 모델을 병렬
호출한다. 일부 스타일이 실패해도 성공한 시안만 돌려준다 — 전부 실패했을 때만
오류다 (N장 모두 보여주겠다고 N배 재시도하면 토큰이 아깝다).
"""

import asyncio
import base64

from pydantic import BaseModel

from app.services.image_ai_edit_service import ImageGenResult, generate_image
from app.services.token_usage import TokenUsage


class ImageBackgroundError(Exception):
    """배경 시안 생성 실패 (전 스타일 실패, API 키 미설정 등)."""


class BackgroundVariant(BaseModel):
    style: str          # 프리셋 키 (로그·추적용)
    label: str          # 화면 표시용 한국어 이름
    image_base64: str   # 그리드에 바로 띄우는 data URL 본문
    mime: str


class BackgroundSuggestion(BaseModel):
    variants: list[BackgroundVariant]


class BackgroundStyle(BaseModel):
    """선택 화면에 뿌릴 스타일 목록 한 줄 (서버가 단일 출처)."""

    key: str
    label: str


# (키, 화면 라벨, 배경 묘사) — 광고 소재에서 수요가 많은 순서
PRESETS: list[tuple[str, str, str]] = [
    ("studio", "스튜디오 화이트", "깔끔한 스튜디오 흰색 배경과 부드러운 그림자"),
    ("gradient", "밝은 그라데이션", "밝고 화사한 파스텔 톤 그라데이션 배경"),
    ("outdoor", "자연광 야외", "자연광이 비치는 야외 풍경 배경 (얕은 심도로 흐리게)"),
    ("luxury", "럭셔리 다크", "고급스러운 어두운 톤 배경과 은은한 스포트라이트 조명"),
]


def available_styles() -> list[BackgroundStyle]:
    return [BackgroundStyle(key=key, label=label) for key, label, _ in PRESETS]


def _selected_presets(styles: list[str] | None) -> list[tuple[str, str, str]]:
    """고른 스타일만 남긴다 — 스타일 하나당 이미지 생성 1회라 그대로 비용이다.

    지정하지 않으면 전체(기존 동작). 모르는 키는 조용히 버리고, 그 결과
    아무것도 남지 않으면 전체로 되돌리지 않고 오류를 낸다 — 사용자가 고른 적
    없는 4장을 만들어 과금하는 것보다 실패가 낫다.
    """
    if not styles:
        return PRESETS
    wanted = {s.strip() for s in styles if s.strip()}
    chosen = [preset for preset in PRESETS if preset[0] in wanted]
    if not chosen:
        raise ImageBackgroundError("선택한 배경 스타일을 찾을 수 없습니다.")
    return chosen


def _prompt(style_desc: str) -> str:
    return (
        "이미지의 전경 요소(제품, 인물, 텍스트, 로고 등)는 위치·크기·내용을 "
        f"그대로 유지하고, 배경만 다음 스타일로 자연스럽게 교체해주세요: {style_desc}. "
        "전경과 배경의 경계는 자연스럽게 합성하고, 결과는 이미지로만 출력하세요."
    )


def _merge_usage(usages: list[TokenUsage | None]) -> TokenUsage | None:
    """여러 호출의 토큰을 한 줄 로그로 합친다 — 사용량 집계가 호출 수와 무관하게 정확해진다."""
    present = [u for u in usages if u is not None]
    if not present:
        return None
    return TokenUsage.of(
        prompt=sum(u.prompt_tokens or 0 for u in present),
        output=sum(u.output_tokens or 0 for u in present),
        total=sum(u.total_tokens or 0 for u in present),
    )


async def suggest_backgrounds(
    file_bytes: bytes,
    mime_type: str = "image/png",
    styles: list[str] | None = None,
) -> tuple[BackgroundSuggestion, TokenUsage | None]:
    """고른 스타일의 배경 시안과 (성공 호출 합산) 토큰 사용량을 반환."""
    presets = _selected_presets(styles)
    results: list[ImageGenResult | None] = await asyncio.gather(
        *(asyncio.to_thread(generate_image, file_bytes, _prompt(desc), mime_type)
          for _, _, desc in presets)
    )

    variants: list[BackgroundVariant] = []
    usages: list[TokenUsage | None] = []
    for (key, label, _), result in zip(presets, results):
        if result is None:
            continue
        variants.append(BackgroundVariant(
            style=key,
            label=label,
            image_base64=base64.b64encode(result.image_bytes).decode("ascii"),
            mime="image/png",
        ))
        usages.append(result.usage)

    if not variants:
        raise ImageBackgroundError(
            "배경 시안을 생성하지 못했습니다. AI 이미지 생성 한도(쿼터)나 API 키 설정을 확인해 주세요."
        )
    return BackgroundSuggestion(variants=variants), _merge_usage(usages)
