from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

# 계정 권한 — users.role 이 가질 수 있는 값. 정의는 여기 한 곳에만 둔다.
# (예전에는 user_admin_schema 에만 있었고 UserOut.role 은 그냥 str 이라,
#  OpenAPI 로 생성한 프런트 타입이 string 으로 풀려 권한 비교가 느슨해졌다.)
UserRole = Literal["user", "admin"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    # Pydantic v2 에서 `class Config` 는 폐기 예정 — 프로젝트 전체를 ConfigDict 로 맞춘다
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    role: UserRole
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
