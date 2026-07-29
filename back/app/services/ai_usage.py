"""AI 호출 사용량을 ai_tool_usage_logs 에 남기는 공용 헬퍼.

이미지·헤딩 도구는 라우터에서 직접 AIToolUsageLogRepository 를 부르지만, 코멘트 생성은
백그라운드 작업이나 크론에서도 호출돼 요청 세션이 없을 때가 있다. 세션을 스스로 열고
실패해도 본 작업을 깨뜨리지 않는 창구를 하나 둔다.
"""

import logging

from app.core.database import SessionLocal
from app.models.user_model import User
from app.repositories.ai_tool_usage_log_repo import AIToolUsageLogRepository
from app.services.token_usage import TokenUsage

logger = logging.getLogger(__name__)

# ai_tool_usage_logs.tool 값 (컬럼이 String(30) 이라 짧게 유지한다).
# 프론트 TOOL_LABELS 와 짝이 맞아야 관리자 화면에 이름이 뜬다.
AI_TOOL_MARKETING_COMMENT = "marketing_comment"
AI_TOOL_REPORT_MAIL = "report_mail"

# 크론·자동 발송처럼 사람이 없는 호출에 쓰는 자리표시자.
# user_id 는 NOT NULL 이지만 users 로의 FK 가 없어 0 을 넣을 수 있다.
_SYSTEM_USER_ID = 0
_SYSTEM_USER_EMAIL = "(자동 실행)"


def log_ai_usage(
    *,
    user: User | None,
    tool: str,
    label: str,
    usage: TokenUsage | None,
) -> None:
    """AI 호출 1건을 기록한다.

    usage 가 None 이면(제공자가 사용량을 안 줬거나 응답 형태가 바뀐 경우) 토큰 칸을
    비워 둔 채 호출 사실만 남긴다 — 건수까지 사라지면 '안 썼다'와 구분되지 않는다.

    기록 실패는 삼킨다. 코멘트는 이미 저장됐는데 로그 때문에 500이 나가면 사용자는
    생성이 실패한 줄 알고 같은 버튼을 다시 눌러 토큰을 한 번 더 쓴다.
    """
    db = SessionLocal()
    try:
        AIToolUsageLogRepository(db).create(
            user=user or User(id=_SYSTEM_USER_ID, email=_SYSTEM_USER_EMAIL),
            tool=tool,
            image_filename=label,
            prompt_tokens=usage.prompt_tokens if usage else None,
            output_tokens=usage.output_tokens if usage else None,
            total_tokens=usage.total_tokens if usage else None,
        )
    except Exception:
        logger.exception("AI 사용량 기록 실패 (tool=%s, label=%s)", tool, label)
        db.rollback()
    finally:
        db.close()
