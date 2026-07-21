from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr

UserRole = Literal["user", "admin"]


class UserAdminOut(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


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
