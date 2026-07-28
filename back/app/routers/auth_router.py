from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
    get_db,
    verify_password,
)
from app.core.settings import settings
from app.models.user_model import User
from app.repositories.user_repo import AccountLockedError, UserRepository
from app.schemas.auth_schema import (
    AccessTokenResponse,
    PasswordChange,
    ProfileUpdate,
    RefreshRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at,
    )


def _to_token_response(user: User) -> TokenResponse:
    access_token = create_access_token(subject=str(user.id), extra_claims={"role": user.role})
    refresh_token = create_refresh_token(subject=str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=_to_user_out(user))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def register(request: Request, body: UserCreate, db: Session = Depends(get_db)):
    # 회원가입은 로컬 개발 환경에서만 허용 (운영 계정은 별도로 생성)
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="회원가입은 비활성화되어 있습니다.")

    repo = UserRepository(db)
    if repo.get_by_email(body.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    user = repo.create_user(email=body.email, password=body.password, name=body.name)
    return _to_token_response(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(request: Request, body: UserLogin, db: Session = Depends(get_db)):
    try:
        user = UserRepository(db).authenticate(body.email, body.password)
    except AccountLockedError as exc:
        # 계정 단위 잠금 — IP 기반 제한과 달리 프록시 헤더를 바꿔도 우회할 수 없다.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"로그인 시도가 너무 많습니다. {settings.LOGIN_LOCKOUT_MINUTES}분 후 다시 시도해 주세요."
            ),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    return _to_token_response(user)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_refresh_token(body.refresh_token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증 토큰이 유효하지 않습니다.")

    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")

    access_token = create_access_token(subject=str(user.id), extra_claims={"role": user.role})
    return AccessTokenResponse(access_token=access_token)


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)):
    return _to_user_out(current_user)


@router.patch("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = UserRepository(db)
    if body.email is not None and body.email != current_user.email:
        if repo.get_by_email(body.email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 사용 중인 이메일입니다.")

    user = repo.update_profile(current_user, name=body.name, email=body.email)
    return _to_user_out(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="현재 비밀번호가 올바르지 않습니다.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="비밀번호는 8자 이상이어야 합니다.")

    UserRepository(db).update_password(current_user, body.new_password)
