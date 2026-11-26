"""AI 코멘트 재사용 — 같은 질문을 두 번 사지 않는다.

코멘트는 같은 데이터로 다시 요청해도 매번 LLM 을 호출했다. 대시보드의 "코멘트 생성"
버튼, 리포트 메일 재발송, 월간 자동 발송이 모두 같은 달을 반복해서 묻는 경로라,
한 달에 같은 질문을 여러 번 사게 된다.

판정 기준은 **보낸 프롬프트 자체**다. 프롬프트가 글자 하나까지 같다면 AI 에게 똑같은
질문을 하는 것이므로 저장된 답을 그대로 쓴다. 이 기준은 두 가지를 공짜로 해결한다.
  - 실적이 바뀌면 프롬프트가 달라져 자동으로 다시 묻는다.
  - 프롬프트 템플릿을 고쳐도 지문이 달라져 자동으로 다시 묻는다.

세션을 스스로 열고 닫는다 — 월간 크론이나 백그라운드 발송처럼 요청 세션이 없는
곳에서도 그대로 쓸 수 있어야 하기 때문이다(log_ai_usage 와 같은 이유).
"""

import hashlib
import logging
from datetime import datetime

from app.core.database import SessionLocal
from app.repositories.marketing_repo import MarketingRepository

logger = logging.getLogger(__name__)


def fingerprint(prompt: str) -> str:
    """프롬프트 → 지문. 원문을 저장할 이유가 없어 해시만 남긴다."""
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def lookup(year: int, month: int, prompt_hash: str, *, company_id: int) -> str | None:
    """같은 질문으로 이미 받아 둔 코멘트. 없으면 None.

    조회 실패는 삼킨다 — 캐시는 비용을 아끼려는 장치이지 기능의 전제가 아니다.
    여기서 예외가 올라가면 캐시 때문에 코멘트 생성 자체가 실패한다.
    """
    db = SessionLocal()
    try:
        return MarketingRepository(db, company_id).get_comment_for_prompt(
            year, month, prompt_hash
        )
    except Exception:
        logger.exception("코멘트 캐시 조회 실패 (%d-%02d)", year, month)
        return None
    finally:
        db.close()


def save(
    year: int, month: int, prompt_hash: str, comment: str, *, company_id: int
) -> datetime | None:
    """코멘트와 지문을 저장하고 저장 시각을 돌려준다. 실패하면 None."""
    db = SessionLocal()
    try:
        saved_at = MarketingRepository(db, company_id).upsert_period_meta(
            year, month, comment=comment, comment_prompt_hash=prompt_hash
        )
        db.commit()
        return saved_at
    except Exception:
        db.rollback()
        logger.exception("코멘트 저장 실패 (%d-%02d)", year, month)
        return None
    finally:
        db.close()
