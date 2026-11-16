from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

UserRole = Literal["user", "admin"]


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
