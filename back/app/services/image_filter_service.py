"""AI 기반 이미지 편집 서비스.

업로드된 이미지 + 자유 텍스트 프롬프트를 Gemini 이미지 생성 모델에 전달해
프롬프트가 지시하는 대로 수정된 이미지를 돌려받고, 필요 시 지정된 크기로
리사이즈해 반환한다.

같은 지시로 여러 장(시안)을 한 번에 만들 수 있다 — 한 장만 받으면 마음에 들지
않을 때 전송을 처음부터 다시 해야 하고, 그 재시도도 똑같이 과금된다. 생성 모델의
`candidate_count` 에 기대지 않고 **같은 프롬프트로 N회 병렬 호출**하는 이유는,
이미지 모델이 후보 개수를 보장하지 않아 "4장 요청했는데 2장만 나오는" 상태가
생기기 때문이다. 호출을 나누면 요청한 장수가 곧 결과 장수다(실패분 제외).
"""

import asyncio
import base64
import io
import logging
from datetime import datetime

from PIL import Image
from pydantic import BaseModel, ConfigDict

from app.core.settings import settings
from app.services.token_usage import TokenUsage
from app.services.image_ai_edit_service import generate_image
from app.services.image_resize_service import resize_image

logger = logging.getLogger(__name__)

# ── 예외 ──────────────────────────────────────────────────────────────────────

class ImageEditError(Exception):
    """AI 이미지 편집 실패 (API 키 미설정, 응답 오류 등)."""


# ── 시안 장수 ─────────────────────────────────────────────────────────────────

#: 기본 생성 장수 — 고객사 요청(2026-11-27)
DEFAULT_EDIT_VARIANTS = 4
#: 한 번에 만들 수 있는 상한. 한 장이 이미지 생성 1회이므로 그대로 토큰 배수다.
#: 배경 시안 상한(프리셋 4 + 직접 입력 3)과 같은 급으로 맞춰, 요청 하나가 서버에
#: 주는 부담의 최대치를 이 기능 안에서 일정하게 유지한다.
MAX_EDIT_VARIANTS = 6


# ── 응답 모델 ─────────────────────────────────────────────────────────────────

class EditVariant(BaseModel):
    image_base64: str
    mime: str
    filename: str


class EditPromptRecord(BaseModel):
    """내가 보낸 편집 전송 1회의 기록 (image_edit_records 에서 읽는다).

    처음에는 사용량 로그에서 프롬프트만 읽었지만, 결과 이미지를 보관하기로
    하면서(②-B, 2026-11-28 사용자 결정) 전용 테이블로 옮겼다 — 이미지 경로와
    만료 상태는 과금 원장이 알 일이 아니다.
    """

    model_config = ConfigDict(from_attributes=True)

    id:             int
    prompt:         str
    image_filename: str
    created_at:     datetime
    #: 생성 당시 시안 장수 — 만료돼도 "시안 4장 (만료)" 로 보여야 한다
    variant_count:  int = 0
    #: 이미지가 아직 스토리지에 있는지 — False 면 보관 기간이 지나 삭제된 것
    images_available: bool = False
    #: 실제 보관된 장수 — 업로드 일부 실패 시 variant_count 보다 적을 수 있다
    image_count: int = 0


class EditPromptHistory(BaseModel):
    items: list[EditPromptRecord]
    total: int = 0
    #: 이미지 보관 일수 — 화면 고지("N일 보관")가 서버 설정과 어긋나지 않게 내려준다
    retention_days: int = 0


class EditResult(BaseModel):
    variants: list[EditVariant]
    #: 요청한 장수 중 실패한 수. 성공분만 돌려주되 몇 장이 빠졌는지는 알려야 한다 —
    #: 4장을 요청했는데 3장만 오면 사용자는 이유를 알 수 없다.
    failed: int = 0
    provider: str = ""


# ── 원본 포맷 → MIME 매핑 ────────────────────────────────────────────────────

_MIME_BY_PIL_FORMAT: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG":  "image/png",
    "WEBP": "image/webp",
    "GIF":  "image/gif",
    "BMP":  "image/bmp",
}


def _detect_mime(file_bytes: bytes) -> str:
    with Image.open(io.BytesIO(file_bytes)) as img:
        return _MIME_BY_PIL_FORMAT.get(img.format or "", "image/png")


# ── 공개 진입점 ───────────────────────────────────────────────────────────────

def edit_and_resize(
    file_bytes:        bytes,
    original_filename: str,
    prompt:             str,
    target_width:       int | None,
    target_height:      int | None,
    output_format:      str = "jpeg",
) -> tuple[io.BytesIO, str, str, str, TokenUsage | None]:
    """
    Returns
    -------
    (buffer, download_filename, content_type, ai_provider_label, token_usage)

    Raises
    ------
    ImageEditError — AI 편집 실패
    """
    mime_type = _detect_mime(file_bytes)

    result = generate_image(file_bytes, prompt, mime_type=mime_type)
    if result is None:
        raise ImageEditError("AI 이미지 편집에 실패했습니다. 잠시 후 다시 시도해주세요.")

    buf, download_name, content_type, _, _ = resize_image(
        file_bytes=result.image_bytes,
        original_filename=original_filename,
        target_width=target_width,
        target_height=target_height,
        output_format=output_format,
    )

    return buf, download_name, content_type, f"Gemini ({settings.GEMINI_IMAGE_MODEL})", result.usage


def _numbered(filename: str, index: int) -> str:
    """시안 번호를 확장자 앞에 붙인다 — 여러 장을 내려받아도 파일이 서로 덮지 않는다."""
    stem, dot, ext = filename.rpartition(".")
    return f"{stem}_{index}{dot}{ext}" if dot else f"{filename}_{index}"


async def edit_variants(
    file_bytes:        bytes,
    original_filename: str,
    prompt:             str,
    target_width:       int | None,
    target_height:      int | None,
    output_format:      str = "jpeg",
    count:              int = DEFAULT_EDIT_VARIANTS,
) -> tuple[EditResult, TokenUsage | None]:
    """같은 지시로 시안 `count` 장을 병렬 생성한다.

    장수가 서로 다른 결과를 주는 건 모델의 생성 변동성 때문이다 — 프롬프트는 전부
    같다. 일부가 실패해도 성공한 것만 돌려주고 실패 수를 함께 알린다. 전부 실패한
    경우에만 오류다 (N장을 채우겠다고 N배 재시도하면 토큰만 쓴다 — 배경 시안과
    같은 판단이다).

    Raises
    ------
    ImageEditError — 모든 시안이 실패
    """
    count = max(1, min(count, MAX_EDIT_VARIANTS))

    def _one() -> tuple[bytes, str, str, TokenUsage | None] | None:
        try:
            buf, name, content_type, _, usage = edit_and_resize(
                file_bytes=file_bytes,
                original_filename=original_filename,
                prompt=prompt,
                target_width=target_width,
                target_height=target_height,
                output_format=output_format,
            )
        except ImageEditError:
            return None
        except Exception:
            # 예상 못 한 예외도 "그 시안 한 장의 실패"로 가둔다. 여기서 새면
            # gather 가 통째로 던져 성공한 시안까지 전부 버려지고, 라우터의
            # 일반 422 가 되어 원인이 화면에서 사라진다. 원인은 로그에 남긴다.
            logger.exception("이미지 시안 생성 실패 (filename=%s)", original_filename)
            return None
        return buf.getvalue(), name, content_type, usage

    results = await asyncio.gather(*(asyncio.to_thread(_one) for _ in range(count)))

    variants: list[EditVariant] = []
    usages: list[TokenUsage | None] = []
    for result in results:
        if result is None:
            continue
        image_bytes, name, content_type, usage = result
        variants.append(EditVariant(
            image_base64=base64.b64encode(image_bytes).decode("ascii"),
            mime=content_type,
            # 한 장일 때는 번호를 붙이지 않는다 — 기존 다운로드 이름 그대로다
            filename=_numbered(name, len(variants) + 1) if count > 1 else name,
        ))
        usages.append(usage)

    if not variants:
        # "잠시 후 다시"라고만 하지 않는다 — 안전 정책 거부(저작권 캐릭터 등)는
        # 몇 번을 다시 보내도 같은 결과라, 바꿔 볼 것이 무엇인지 알려야 한다.
        raise ImageEditError(
            "AI 이미지 편집에 실패했습니다. 일시적인 오류일 수도 있지만, "
            "이미지나 지시가 AI 정책상 거부됐을 수도 있어요 — 다른 이미지나 "
            "표현으로 시도해 보세요."
        )

    return (
        EditResult(
            variants=variants,
            failed=count - len(variants),
            provider=f"Gemini ({settings.GEMINI_IMAGE_MODEL})",
        ),
        _merge_usage(usages),
    )


def _merge_usage(usages: list[TokenUsage | None]) -> TokenUsage | None:
    """여러 호출의 토큰을 한 줄 로그로 합친다 — 집계가 호출 수와 무관하게 정확해진다."""
    present = [u for u in usages if u is not None]
    if not present:
        return None
    return TokenUsage.of(
        prompt=sum(u.prompt_tokens or 0 for u in present),
        output=sum(u.output_tokens or 0 for u in present),
        total=sum(u.total_tokens or 0 for u in present),
    )
