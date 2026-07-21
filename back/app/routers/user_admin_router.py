from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_db, require_admin
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


@router.get("", response_model=list[UserAdminOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return UserRepository(db).list_all()


@router.post("", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserAdminCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    repo = UserRepository(db)
    if repo.get_by_email(body.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")
    return repo.create_user(email=body.email, password=body.password, name=body.name, role=body.role)


@router.patch("/{user_id}/role", response_model=UserAdminOut)
def update_role(
    user_id: int,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자신의 권한은 변경할 수 없습니다.")

    user = UserRepository(db).set_role(user_id, body.role)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    return user


@router.patch("/{user_id}/active", response_model=UserAdminOut)
def update_active(
    user_id: int,
    body: UserActiveUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자신의 계정은 비활성화할 수 없습니다.")

    user = UserRepository(db).set_active(user_id, body.is_active)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    return user


@router.patch("/{user_id}/profile", response_model=UserAdminOut)
def update_profile(
    user_id: int,
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    if body.email is not None and body.email != user.email:
        if repo.get_by_email(body.email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 사용 중인 이메일입니다.")

    return repo.update_profile(user, name=body.name, email=body.email)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int,
    body: UserPasswordReset,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="비밀번호는 8자 이상이어야 합니다.")

    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    repo.update_password(user, body.new_password)
