"""테넌트(기업) 컨텍스트 — 멀티테넌시 격리의 신뢰 원천.

모든 업무 라우터는 요청 파라미터의 기업 ID 를 절대 믿지 않는다. 데이터 접근의 기준
기업은 오직 여기서 나온다:

- admin/member/trial: 자기 소속 기업(current_user.company_id). 끝.
- dev(무소속): 업무 데이터를 보려면 X-Company-Id 헤더로 대상 기업을 명시해야 하고,
  그 열람은 감사 로그(data.view_as_dev)에 반드시 남는다 — 기획 확정 사항.

크론·자동 발송 같은 시스템 경로는 사용자 토큰이 없으므로 이 모듈을 쓰지 않고,
호출부가 company_id 를 명시적으로 든다 (과도기에는 SY_COMPANY_ID 고정 —
기업별 수신자 저장소가 생기면 기업 루프로 바뀐다).
"""

import logging
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user, get_db
from app.models.audit_log_model import AuditLog
from app.models.company_model import Company
from app.models.user_model import User

logger = logging.getLogger(__name__)

# 마이그레이션 0012 가 시드한 첫 기업. 시스템 경로(크론·자동 발송)의 과도기 귀속처다.
SY_COMPANY_ID = 1


@dataclass(frozen=True)
class TenantContext:
    """요청 1건의 데이터 접근 범위 — 리포지토리는 이 company_id 밖을 볼 수 없다."""

    user: User
    company_id: int

    @property
    def is_dev(self) -> bool:
        return self.user.role == "dev"


def log_audit(
    db: Session,
    *,
    actor: User,
    action: str,
    target_type: str = "",
    target_id: str = "",
    company_id: int | None = None,
    detail: dict | None = None,
) -> None:
    """감사 로그 1건 기록 — append-only, 실패해도 본 작업을 깨뜨리지 않는다."""
    try:
        db.add(
            AuditLog(
                actor_user_id=actor.id,
                actor_email=actor.email,
                actor_role=actor.role,
                action=action,
                target_type=target_type,
                target_id=target_id,
                company_id=company_id,
                detail=detail or {},
            )
        )
        db.commit()
    except Exception:
        logger.exception("감사 로그 기록 실패 (action=%s)", action)
        db.rollback()


def get_tenant_context(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_company_id: str | None = Header(default=None, alias="X-Company-Id"),
) -> TenantContext:
    """업무 데이터 라우터의 표준 의존성.

    dev 가 아닌 사용자가 보낸 X-Company-Id 는 무시한다 — 헤더로 남의 기업을
    가리키는 시도 자체가 성립하지 않게 한다.
    """
    if current_user.role != "dev":
        # CHECK 제약(dev 만 NULL)상 여기서 company_id 는 항상 존재한다.
        return TenantContext(user=current_user, company_id=current_user.company_id)

    if not x_company_id:
        # 과도기: dev 전용 페이지(기업 선택기)가 생기기 전까지는 헤더 없는 dev 요청을
        # sy 로 간주한다 — 승격 직후에도 기존 admin 화면이 계속 동작해야 한다.
        # 열람 감사는 아래에서 동일하게 남는다. 4단계에서 "헤더 필수"로 조인다.
        company_id = SY_COMPANY_ID
    else:
        try:
            company_id = int(x_company_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="X-Company-Id 가 올바르지 않습니다."
            ) from None

    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="기업을 찾을 수 없습니다.")

    # dev 의 기업 데이터 열람은 반드시 감사 로그에 남긴다 — 기획 확정 사항.
    log_audit(
        db,
        actor=current_user,
        action="data.view_as_dev",
        target_type="company",
        target_id=str(company_id),
        company_id=company_id,
    )
    return TenantContext(user=current_user, company_id=company_id)


def get_admin_tenant_context(
    ctx: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    """관리자(기업 admin 또는 dev) 전용 테넌트 컨텍스트."""
    if ctx.user.role not in ("admin", "dev"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
    return ctx
