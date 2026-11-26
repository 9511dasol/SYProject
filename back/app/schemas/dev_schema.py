"""dev(플랫폼 운영자) 전용 API 스키마 — /api/dev/*"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.auth_schema import UserRole

# dev 가 이 화면에서 만들 수 있는 역할 — dev 역할은 스크립트로만 만든다.
DevCreatableRole = Literal["member", "admin", "trial"]


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool
    is_trial: bool
    expires_at: datetime | None
    created_at: datetime
    # 집계 필드 — 목록 화면이 기업별 현황을 한 번에 본다.
    user_count: int = 0
    admin_email: str | None = None
    monthly_token_budget: int = 0
    month_tokens_used: int = 0


class CompanyListResponse(BaseModel):
    items: list[CompanyOut]
    total: int


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CompanyActiveUpdate(BaseModel):
    is_active: bool


class CompanyBudgetUpdate(BaseModel):
    monthly_token_budget: int = Field(ge=0)  # 0 = 미설정(무제한)


class AdminIssueRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class DevUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    company_id: int | None
    created_at: datetime
    locked_until: datetime | None = None


class DevUserCreate(BaseModel):
    company_id: int
    email: EmailStr
    password: str
    name: str = ""
    role: DevCreatableRole = "member"


class DevUserRoleUpdate(BaseModel):
    role: DevCreatableRole


class DevUserActiveUpdate(BaseModel):
    is_active: bool


class DevUserProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None


class DevUserPasswordReset(BaseModel):
    new_password: str


class TrialCreate(BaseModel):
    # 기본값은 서버 설정(TRIAL_DEFAULT_DAYS)이 정한다 — None 이면 서비스가 채운다.
    days: int | None = Field(default=None, ge=1, le=30, description="만료까지 일수 (미지정 시 서버 기본값)")
    company_name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    password: str | None = None


class TrialOut(BaseModel):
    company_id: int
    company_name: str
    email: str
    # 초기 비밀번호는 이 응답에서 한 번만 노출된다 — 서버는 해시만 저장한다.
    password: str
    expires_at: datetime


class TrialExtend(BaseModel):
    days: int = Field(ge=1, le=30, description="지금부터 며칠 더 열어둘지")


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_user_id: int
    actor_email: str
    actor_role: str
    action: str
    target_type: str
    target_id: str
    company_id: int | None
    detail: dict
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
