from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import SessionLocal
from app.core.security import create_access_token, get_current_user
from app.core.settings import settings
from app.models.user_model import User
from app.repositories.user_repo import UserRepository
from app.schemas.auth_schema import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _to_token_response(user: User) -> TokenResponse:
    access_token = create_access_token(subject=str(user.id), extra_claims={"role": user.role})
    return TokenResponse(
        access_token=access_token,
        user=UserOut(id=user.id, email=user.email, name=user.name, role=user.role),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate):
    # 회원가입은 로컬 개발 환경에서만 허용 (운영 계정은 별도로 생성)
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="회원가입은 비활성화되어 있습니다.")

    db = SessionLocal()
    try:
        repo = UserRepository(db)
        if repo.get_by_email(body.email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

        user = repo.create_user(email=body.email, password=body.password, name=body.name)
        return _to_token_response(user)
    finally:
        db.close()


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    db = SessionLocal()
    try:
        repo = UserRepository(db)
        user = repo.authenticate(body.email, body.password)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

        return _to_token_response(user)
    finally:
        db.close()


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)):
    return UserOut(id=current_user.id, email=current_user.email, name=current_user.name, role=current_user.role)
