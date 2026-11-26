"""dev(플랫폼 운영자) 전용 관리 API — /api/dev/*

기업·계정·기업별 AI 예산·감사 로그·체험 계정을 여기서 관리한다 (기획 확정 6장).
모든 쓰기 행위는 감사 로그(audit_logs)에 남는다 — dev 의 행위 전수 기록은
기획 확정 사항이다.

실기업 삭제는 soft(정지) 가 기본이고, 물리 삭제(DELETE)는 체험 기업에만 허용한다 —
실기업 데이터를 버튼 하나로 날릴 수 있는 경로를 아예 만들지 않는다.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.ai_budget import current_month_start
from app.core.security import get_db, require_dev, validate_password_policy
from app.core.tenant import log_audit
from app.models.ai_tool_usage_log_model import AIToolUsageLog
from app.models.ai_usage_budget_model import AIUsageBudget
from app.models.audit_log_model import AuditLog
from app.models.company_model import Company
from app.models.user_model import User
from app.repositories.ai_usage_budget_repo import AIUsageBudgetRepository
from app.repositories.user_repo import UserRepository
from app.schemas.dev_schema import (
    AdminIssueRequest,
    AuditLogListResponse,
    AuditLogOut,
    CompanyActiveUpdate,
    CompanyBudgetUpdate,
    CompanyCreate,
    CompanyListResponse,
    CompanyOut,
    DevUserActiveUpdate,
    DevUserCreate,
    DevUserOut,
    DevUserPasswordReset,
    DevUserProfileUpdate,
    DevUserRoleUpdate,
    TrialCreate,
    TrialExtend,
    TrialOut,
)
from app.services import trial_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dev", tags=["dev"])

# 기업명 유니크 제약 — Postgres 가 자동으로 붙이는 이름과 모델에서 지정할 수 있는 이름 둘 다.
_COMPANY_NAME_CONSTRAINTS = {"companies_name_key", "uq_companies_name"}


def _integrity_error(exc: IntegrityError, *, what: str) -> HTTPException:
    """IntegrityError 를 사용자에게 보일 응답으로 바꾼다.

    기업명 중복(23505 + 기업명 제약)만 409 로 특정하고, 나머지는 원인을 로그에 남긴 뒤
    500 으로 돌린다.

    예전에는 어떤 IntegrityError 든 "이미 같은 이름의 기업이 있습니다"로 뭉뚱그렸다.
    체험 발급은 기업·계정·예산·샘플 데이터를 한 트랜잭션에 넣기 때문에, 전혀 다른
    원인이 기업명 탓으로 둔갑했다 — 실제로 ai_usage_budget.id 시퀀스 누락(0016)이
    "이미 같은 이름의 기업이 있습니다"로 보고돼 원인 추적을 막았다. 기업명은 UUID
    조각으로 만들어져 중복될 수가 없는데도 그렇게 표시됐다.
    """
    orig = getattr(exc, "orig", None)
    sqlstate = getattr(orig, "sqlstate", None)
    constraint = getattr(getattr(orig, "diag", None), "constraint_name", None) or ""
    message = str(orig)

    # Postgres 는 제약 이름으로 정확히 판별한다. SQLite(로컬·테스트)는 sqlstate 도
    # 제약 이름도 주지 않으므로 메시지로 본다 — 두 경로 모두 받아야 테스트와 운영이
    # 같은 응답을 낸다.
    name_conflict = (sqlstate == "23505" and constraint in _COMPANY_NAME_CONSTRAINTS) or (
        "UNIQUE constraint failed" in message and "companies.name" in message
    )
    if name_conflict:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이미 같은 이름의 기업이 있습니다."
        )

    logger.error(
        "%s 실패 — IntegrityError (sqlstate=%s, constraint=%s): %s",
        what, sqlstate or "?", constraint or "?", orig,
    )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"{what}에 실패했습니다. 잠시 후 다시 시도하거나 서버 로그를 확인해 주세요.",
    )


def _get_company(db: Session, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="기업을 찾을 수 없습니다.")
    return company


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    if user.role == "dev":
        # dev 계정은 이 화면의 관리 대상이 아니다 — 승격·강등 모두 스크립트로만.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="dev 계정은 여기서 관리할 수 없습니다.")
    return user


# ── 기업 관리 ─────────────────────────────────────────────────────────────────


@router.get("/companies", response_model=CompanyListResponse)
def list_companies(
    db: Session = Depends(get_db),
    _dev: User = Depends(require_dev),
) -> CompanyListResponse:
    """기업 목록 + 기업별 현황(계정 수·admin·이번 달 토큰 사용량·예산)을 한 번에."""
    companies = db.query(Company).order_by(Company.id).all()

    user_counts = dict(
        db.query(User.company_id, func.count(User.id))
        .filter(User.company_id.isnot(None))
        .group_by(User.company_id)
        .all()
    )
    admin_emails = dict(
        db.query(User.company_id, User.email).filter(User.role == "admin").all()
    )
    budgets = dict(
        db.query(AIUsageBudget.company_id, AIUsageBudget.monthly_token_budget).all()
    )
    month_usage = dict(
        db.query(
            AIToolUsageLog.company_id,
            func.coalesce(func.sum(AIToolUsageLog.total_tokens), 0),
        )
        .filter(AIToolUsageLog.created_at >= current_month_start())
        .group_by(AIToolUsageLog.company_id)
        .all()
    )

    items = [
        CompanyOut(
            id=c.id,
            name=c.name,
            is_active=c.is_active,
            is_trial=c.is_trial,
            expires_at=c.expires_at,
            created_at=c.created_at,
            user_count=int(user_counts.get(c.id, 0)),
            admin_email=admin_emails.get(c.id),
            monthly_token_budget=int(budgets.get(c.id, 0)),
            month_tokens_used=int(month_usage.get(c.id, 0)),
        )
        for c in companies
    ]
    return CompanyListResponse(items=items, total=len(items))


@router.post("/companies", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    body: CompanyCreate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> CompanyOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="기업명을 입력해 주세요.")

    company = Company(name=name)
    db.add(company)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_error(exc, what="기업 생성") from None
    db.refresh(company)

    log_audit(
        db, actor=dev, action="company.create", target_type="company",
        target_id=str(company.id), company_id=company.id, detail={"name": name},
    )
    return CompanyOut.model_validate(company)


@router.patch("/companies/{company_id}/active", response_model=CompanyOut)
def update_company_active(
    company_id: int,
    body: CompanyActiveUpdate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> CompanyOut:
    """기업 정지/재개 — 정지하면 소속 계정 전원이 즉시(매 요청 검사) 차단된다."""
    company = _get_company(db, company_id)
    company.is_active = body.is_active
    db.commit()
    db.refresh(company)

    log_audit(
        db, actor=dev, action="company.active_change", target_type="company",
        target_id=str(company_id), company_id=company_id,
        detail={"is_active": body.is_active},
    )
    return CompanyOut.model_validate(company)


@router.patch("/companies/{company_id}/budget", response_model=CompanyOut)
def update_company_budget(
    company_id: int,
    body: CompanyBudgetUpdate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> CompanyOut:
    company = _get_company(db, company_id)
    AIUsageBudgetRepository(db).set(company_id, body.monthly_token_budget)

    log_audit(
        db, actor=dev, action="budget.set", target_type="budget",
        target_id=str(company_id), company_id=company_id,
        detail={"monthly_token_budget": body.monthly_token_budget},
    )
    out = CompanyOut.model_validate(company)
    out.monthly_token_budget = body.monthly_token_budget
    return out


@router.post(
    "/companies/{company_id}/admin",
    response_model=DevUserOut,
    status_code=status.HTTP_201_CREATED,
)
def issue_company_admin(
    company_id: int,
    body: AdminIssueRequest,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> DevUserOut:
    """기업의 admin 계정 발급 — 기업당 1개는 DB(partial unique)가 강제한다."""
    _get_company(db, company_id)
    validate_password_policy(body.password)

    repo = UserRepository(db)
    if repo.get_by_email(body.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    try:
        user = repo.create_user(
            email=body.email, password=body.password, name=body.name,
            role="admin", company_id=company_id,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이 기업에는 이미 관리자 계정이 있습니다."
        ) from None

    log_audit(
        db, actor=dev, action="user.create", target_type="user",
        target_id=str(user.id), company_id=company_id,
        detail={"email": user.email, "role": "admin"},
    )
    return DevUserOut.model_validate(user)


@router.delete("/companies/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> dict:
    """체험 기업 물리 삭제. 실기업은 정지(soft)만 가능하다 — 400."""
    company = _get_company(db, company_id)
    if not company.is_trial:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="실기업은 삭제할 수 없습니다. 정지(비활성화)를 사용하세요.",
        )

    name = company.name
    trial_service.delete_company_cascade(db, company_id)
    db.commit()

    log_audit(
        db, actor=dev, action="trial.delete", target_type="company",
        target_id=str(company_id), company_id=company_id, detail={"name": name},
    )
    return {"message": f"체험 기업 '{name}' 을 삭제했습니다."}


# ── 계정 관리 (전 기업) ───────────────────────────────────────────────────────


@router.get("/users", response_model=list[DevUserOut])
def list_users(
    company_id: int | None = Query(None, description="지정하면 그 기업 소속만"),
    db: Session = Depends(get_db),
    _dev: User = Depends(require_dev),
) -> list[DevUserOut]:
    repo = UserRepository(db)
    users = repo.list_by_company(company_id) if company_id is not None else repo.list_all()
    return [DevUserOut.model_validate(u) for u in users]


@router.post("/users", response_model=DevUserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: DevUserCreate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> DevUserOut:
    _get_company(db, body.company_id)
    validate_password_policy(body.password)

    repo = UserRepository(db)
    if repo.get_by_email(body.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    try:
        user = repo.create_user(
            email=body.email, password=body.password, name=body.name,
            role=body.role, company_id=body.company_id,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이 기업에는 이미 관리자 계정이 있습니다."
        ) from None

    log_audit(
        db, actor=dev, action="user.create", target_type="user",
        target_id=str(user.id), company_id=body.company_id,
        detail={"email": user.email, "role": body.role},
    )
    return DevUserOut.model_validate(user)


@router.patch("/users/{user_id}/role", response_model=DevUserOut)
def update_user_role(
    user_id: int,
    body: DevUserRoleUpdate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> DevUserOut:
    user = _get_user(db, user_id)
    before = user.role
    user.role = body.role
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이 기업에는 이미 관리자 계정이 있습니다."
        ) from None
    db.refresh(user)

    log_audit(
        db, actor=dev, action="user.role_change", target_type="user",
        target_id=str(user_id), company_id=user.company_id,
        detail={"before": before, "after": body.role},
    )
    return DevUserOut.model_validate(user)


@router.patch("/users/{user_id}/active", response_model=DevUserOut)
def update_user_active(
    user_id: int,
    body: DevUserActiveUpdate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> DevUserOut:
    user = _get_user(db, user_id)
    user.is_active = body.is_active
    db.commit()
    db.refresh(user)

    log_audit(
        db, actor=dev, action="user.active_change", target_type="user",
        target_id=str(user_id), company_id=user.company_id,
        detail={"is_active": body.is_active},
    )
    return DevUserOut.model_validate(user)


@router.patch("/users/{user_id}/unlock", response_model=DevUserOut)
def unlock_user(
    user_id: int,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> DevUserOut:
    """로그인 연속 실패 잠금 해제."""
    user = _get_user(db, user_id)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    db.refresh(user)

    log_audit(
        db, actor=dev, action="user.unlock", target_type="user",
        target_id=str(user_id), company_id=user.company_id,
    )
    return DevUserOut.model_validate(user)


@router.patch("/users/{user_id}/profile", response_model=DevUserOut)
def update_user_profile(
    user_id: int,
    body: DevUserProfileUpdate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> DevUserOut:
    user = _get_user(db, user_id)
    repo = UserRepository(db)

    if body.email is not None and body.email != user.email:
        if repo.get_by_email(body.email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 사용 중인 이메일입니다.")

    updated = repo.update_profile(user, name=body.name, email=body.email)
    log_audit(
        db, actor=dev, action="user.profile_change", target_type="user",
        target_id=str(user_id), company_id=user.company_id,
    )
    return DevUserOut.model_validate(updated)


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    body: DevUserPasswordReset,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
):
    validate_password_policy(body.new_password)
    user = _get_user(db, user_id)
    UserRepository(db).update_password(user, body.new_password)

    log_audit(
        db, actor=dev, action="user.password_reset", target_type="user",
        target_id=str(user_id), company_id=user.company_id,
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> dict:
    """계정 영구 삭제. 데이터 이력(사용량 로그 등)은 남는다 — 지우는 건 계정뿐이다."""
    user = _get_user(db, user_id)
    email, company_id = user.email, user.company_id
    db.delete(user)
    db.commit()

    log_audit(
        db, actor=dev, action="user.delete", target_type="user",
        target_id=str(user_id), company_id=company_id, detail={"email": email},
    )
    return {"message": f"{email} 계정을 삭제했습니다."}


# ── 체험 계정 ─────────────────────────────────────────────────────────────────


@router.post("/trials", response_model=TrialOut, status_code=status.HTTP_201_CREATED)
def create_trial(
    body: TrialCreate,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> TrialOut:
    """체험 샌드박스 발급 — 기업+계정+샘플 데이터+소액 예산이 한 번에 만들어진다.

    응답의 password 는 이 자리에서만 노출된다(서버에는 해시만 남는다).
    """
    if body.password is not None:
        validate_password_policy(body.password)
    if body.email is not None and UserRepository(db).get_by_email(body.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    try:
        result = trial_service.create_trial(
            db,
            days=body.days,
            company_name=body.company_name,
            email=body.email,
            password=body.password,
        )
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_error(exc, what="체험 발급") from None

    log_audit(
        db, actor=dev, action="trial.create", target_type="company",
        target_id=str(result["company_id"]), company_id=result["company_id"],
        detail={"days": body.days, "email": result["email"]},
    )
    return TrialOut(**result)


@router.patch("/trials/{company_id}", response_model=CompanyOut)
def extend_trial(
    company_id: int,
    body: TrialExtend,
    db: Session = Depends(get_db),
    dev: User = Depends(require_dev),
) -> CompanyOut:
    """체험 기간 연장 — 지금부터 days 일 뒤로 만료를 다시 잡는다."""
    company = _get_company(db, company_id)
    if not company.is_trial:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="체험 기업이 아닙니다.")

    company.expires_at = datetime.now(timezone.utc) + timedelta(days=body.days)
    db.commit()
    db.refresh(company)

    log_audit(
        db, actor=dev, action="trial.extend", target_type="company",
        target_id=str(company_id), company_id=company_id,
        detail={"days": body.days, "expires_at": company.expires_at.isoformat()},
    )
    return CompanyOut.model_validate(company)


# ── 감사 로그 ─────────────────────────────────────────────────────────────────


@router.get("/audit-logs", response_model=AuditLogListResponse)
def list_audit_logs(
    company_id: int | None = Query(None, description="대상 기업으로 거르기"),
    action: str | None = Query(None, description="행위 종류로 거르기 (예: user.create)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _dev: User = Depends(require_dev),
) -> AuditLogListResponse:
    query = db.query(AuditLog)
    if company_id is not None:
        query = query.filter(AuditLog.company_id == company_id)
    if action:
        query = query.filter(AuditLog.action == action)

    total = query.count()
    items = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AuditLogListResponse(
        items=[AuditLogOut.model_validate(log) for log in items], total=total
    )
