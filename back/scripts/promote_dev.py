"""지정 계정을 dev(플랫폼 운영자)로 승격하는 1회성 운영 스크립트.

마이그레이션에 넣지 않은 이유: 특정 이메일을 리비전에 박으면 마이그레이션의
결정성(어느 DB에서나 같은 결과)이 깨진다. 승격은 운영 행위이므로 여기서 하고,
감사 로그(audit_logs)에 남긴다.

dev 는 무소속이다(company_id NULL — ck_users_dev_no_company 가 강제). 승격 대상이
어느 기업의 유일한 admin 이었다면 그 기업은 admin 이 없는 상태가 되며, 이후 dev
페이지에서 새 admin 을 발급하면 된다.

사용법:
    python scripts/promote_dev.py <이메일 또는 이메일 앞부분>

앞부분만 주면 그 문자열로 시작하는 계정을 찾되, 2건 이상이면 중단한다.
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # back/ 를 import 경로에 추가

from app.core.database import SessionLocal, engine  # noqa: E402
from app.models.audit_log_model import AuditLog  # noqa: E402

# 지우지 말 것 — 직접 쓰지는 않지만 users.company_id 의 FK(companies.id) 를 풀려면
# Company 가 같은 metadata 에 등록돼 있어야 한다. 없으면 첫 쿼리에서
# NoReferencedTableError 로 죽는다(이 import 가 빠져 있어 실제로 그랬다).
from app.models.company_model import Company  # noqa: E402,F401
from app.models.user_model import User  # noqa: E402

logger = logging.getLogger("promote_dev")

_EXIT_OK = 0
_EXIT_FAILED = 1


def _promote(query: str) -> int:
    db = SessionLocal()
    try:
        exact = db.query(User).filter(User.email == query).all()
        candidates = exact or (
            db.query(User).filter(User.email.like(f"{query}%")).order_by(User.id).all()
        )

        if not candidates:
            logger.error("'%s' 에 해당하는 계정이 없습니다.", query)
            return _EXIT_FAILED
        if len(candidates) > 1:
            logger.error(
                "'%s' 로 시작하는 계정이 %d건입니다 — 정확한 이메일로 다시 실행하세요: %s",
                query,
                len(candidates),
                ", ".join(u.email for u in candidates),
            )
            return _EXIT_FAILED

        user = candidates[0]
        if user.role == "dev":
            logger.info("%s 는 이미 dev 입니다 — 변경 없음.", user.email)
            return _EXIT_OK

        before_role, before_company = user.role, user.company_id
        user.role = "dev"
        user.company_id = None  # dev 는 무소속 — CHECK 제약이 강제한다

        db.add(
            AuditLog(
                actor_user_id=user.id,
                actor_email=user.email,
                actor_role="dev",
                action="user.promote_dev",
                target_type="user",
                target_id=str(user.id),
                company_id=before_company,
                detail={"before_role": before_role, "via": "scripts/promote_dev.py"},
            )
        )
        db.commit()
        logger.info(
            "%s 를 dev 로 승격했습니다 (이전: role=%s, company_id=%s).",
            user.email,
            before_role,
            before_company,
        )
        if before_role == "admin" and before_company is not None:
            logger.warning(
                "기업(id=%s)의 admin 자리가 비었습니다 — dev 페이지에서 새 admin 을 발급하세요.",
                before_company,
            )
        return _EXIT_OK
    finally:
        db.close()


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    engine.echo = False

    if len(argv) < 2 or not argv[1].strip():
        logger.error("사용법: python scripts/promote_dev.py <이메일 또는 이메일 앞부분>")
        return _EXIT_FAILED

    try:
        return _promote(argv[1].strip())
    except Exception:
        logger.exception("승격 실패 — DATABASE_URL 접속 여부와 스키마(0014 적용)를 확인하세요.")
        return _EXIT_FAILED


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
