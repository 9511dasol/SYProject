from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import get_db, validate_password_policy
from app.core.tenant import TenantContext, get_admin_tenant_context, log_audit
from app.models.user_model import User
from app.repositories.user_repo import UserRepository
from app.schemas.user_admin_schema import (
    UserActiveUpdate,
    UserAdminCreate,
    UserAdminOut,
    UserPasswordReset,
    UserProfileUpdate,
    UserRoleUpdate,
)

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])

# 기업 admin 이 이 화면에서 만들 수 있는 역할 — 사원뿐이다(기획 확정 #3).
# admin 발급·체험 계정 발급은 dev 의 일이고, dev 역할은 스크립트로만 만든다.
_ADMIN_CREATABLE_ROLES = {"member"}
_DEV_CREATABLE_ROLES = {"member", "admin", "trial"}


def _target_in_scope(repo: UserRepository, ctx: TenantContext, user_id: int) -> User:
    """대상 계정을 기업 경계 안에서 찾는다 — 타기업 계정은 404 (존재 자체를 숨긴다)."""
    user = repo.get_by_id_in_company(user_id, ctx.company_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    return user


@router.get("", response_model=list[UserAdminOut])
def list_users(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
):
    # dev 도 X-Company-Id 로 지정한 "그 기업" 범위만 본다 — 전 기업 횡단 조회는
    # /api/dev/* (4단계) 의 몫이다.
    return UserRepository(db).list_by_company(ctx.company_id)


@router.post("", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserAdminCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
):
    allowed = _DEV_CREATABLE_ROLES if ctx.is_dev else _ADMIN_CREATABLE_ROLES
    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 화면에서는 사원 계정만 만들 수 있습니다." if not ctx.is_dev else "dev 역할은 생성할 수 없습니다.",
        )

    validate_password_policy(body.password)

    repo = UserRepository(db)
    if repo.get_by_email(body.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    try:
        user = repo.create_user(
            email=body.email,
            password=body.password,
            name=body.name,
            role=body.role,
            company_id=ctx.company_id,
        )
    except IntegrityError:
        # 기업당 admin 1개 — DB partial unique 가 최종 방어선이다.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이 기업에는 이미 관리자 계정이 있습니다."
        ) from None

    log_audit(
        db,
        actor=ctx.user,
        action="user.create",
        target_type="user",
        target_id=str(user.id),
        company_id=ctx.company_id,
        detail={"email": user.email, "role": user.role},
    )
    return user


@router.patch("/{user_id}/role", response_model=UserAdminOut)
def update_role(
    user_id: int,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
):
    if user_id == ctx.user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자신의 권한은 변경할 수 없습니다.")
    if body.role == "dev":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="dev 권한은 이 화면에서 부여할 수 없습니다.")

    repo = UserRepository(db)
    target = _target_in_scope(repo, ctx, user_id)
    before_role = target.role

    try:
        user = repo.set_role(target.id, body.role)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이 기업에는 이미 관리자 계정이 있습니다."
        ) from None

    log_audit(
        db,
        actor=ctx.user,
        action="user.role_change",
        target_type="user",
        target_id=str(user_id),
        company_id=ctx.company_id,
        detail={"before": before_role, "after": body.role},
    )
    return user


@router.patch("/{user_id}/active", response_model=UserAdminOut)
def update_active(
    user_id: int,
    body: UserActiveUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
):
    if user_id == ctx.user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자신의 계정은 비활성화할 수 없습니다.")

    repo = UserRepository(db)
    _target_in_scope(repo, ctx, user_id)
    user = repo.set_active(user_id, body.is_active)

    log_audit(
        db,
        actor=ctx.user,
        action="user.active_change",
        target_type="user",
        target_id=str(user_id),
        company_id=ctx.company_id,
        detail={"is_active": body.is_active},
    )
    return user


@router.patch("/{user_id}/profile", response_model=UserAdminOut)
def update_profile(
    user_id: int,
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
):
    repo = UserRepository(db)
    user = _target_in_scope(repo, ctx, user_id)

    if body.email is not None and body.email != user.email:
        if repo.get_by_email(body.email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 사용 중인 이메일입니다.")

    updated = repo.update_profile(user, name=body.name, email=body.email)
    log_audit(
        db,
        actor=ctx.user,
        action="user.profile_change",
        target_type="user",
        target_id=str(user_id),
        company_id=ctx.company_id,
    )
    return updated


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int,
    body: UserPasswordReset,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_admin_tenant_context),
):
    validate_password_policy(body.new_password)

    repo = UserRepository(db)
    user = _target_in_scope(repo, ctx, user_id)
    repo.update_password(user, body.new_password)

    log_audit(
        db,
        actor=ctx.user,
        action="user.password_reset",
        target_type="user",
        target_id=str(user_id),
        company_id=ctx.company_id,
    )
