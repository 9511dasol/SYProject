from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

# 정의는 auth_schema 한 곳에 둔다 — 같은 값을 두 모듈이 각자 들고 있으면 언젠가 갈린다.
from app.schemas.auth_schema import UserRole

__all__ = ["UserRole"]  # 이 경로로 임포트하던 코드를 깨뜨리지 않는다


class UserAdminOut(BaseModel):
    # Pydantic v2 에서 `class Config` 는 폐기 예정 — 프로젝트 전체를 ConfigDict 로 맞춘다
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class UserAdminCreate(BaseModel):
    email: EmailStr
    password: str
    name: str = ""
    role: UserRole = "user"


class UserRoleUpdate(BaseModel):
    role: UserRole


class UserActiveUpdate(BaseModel):
    is_active: bool


class UserProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None


class UserPasswordReset(BaseModel):
    new_password: str
