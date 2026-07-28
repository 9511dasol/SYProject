"""배포 파이프라인용 마이그레이션 엔트리포인트.

앱 기동과 분리된 별도 단계에서 실행한다 — 마이그레이션이 실패하면 여기서
비정상 종료(exit 1)하므로, 새 리비전을 내보내기 전에 파이프라인이 멈춘다.
기동 시 적용하면 같은 실패가 "컨테이너가 포트를 못 엶"으로만 보인다.

사용법:
    python scripts/migrate.py upgrade   # alembic upgrade head (기본값)
    python scripts/migrate.py check     # 적용하지 않고 상태만 확인

Cloud Run Job 예시는 back/TODO_DEPLOY.md 참고.
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # back/ 를 import 경로에 추가

from app.core.migrations import schema_state, upgrade_to_head  # noqa: E402

logger = logging.getLogger("migrate")

_EXIT_OK = 0
_EXIT_FAILED = 1


def _upgrade() -> int:
    state, detail = schema_state()
    if state == "unknown":
        # upgrade 를 시도해도 alembic 이 리비전을 못 찾아 실패한다.
        # 그때의 CommandError 보다 원인을 알려주는 메시지를 먼저 남긴다.
        logger.error("마이그레이션 중단 — %s", detail)
        return _EXIT_FAILED

    logger.info("현재 상태 [%s] — %s", state, detail)
    upgrade_to_head()
    logger.info("완료 — %s", schema_state()[1])
    return _EXIT_OK


def _check() -> int:
    state, detail = schema_state()
    if state == "ok":
        logger.info("%s", detail)
        return _EXIT_OK
    logger.error("스키마 불일치 [%s] — %s", state, detail)
    return _EXIT_FAILED


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    action = argv[1] if len(argv) > 1 else "upgrade"
    if action not in {"upgrade", "check"}:
        logger.error("알 수 없는 명령: %s (upgrade | check)", action)
        return _EXIT_FAILED

    try:
        return _upgrade() if action == "upgrade" else _check()
    except Exception:
        logger.exception("마이그레이션 %s 실패 — DATABASE_URL 접속 여부를 확인하세요.", action)
        return _EXIT_FAILED


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
