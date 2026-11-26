from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.settings import settings
from app.models.company_model import Company
from app.models.user_model import User

# 프론트(NextAuth)에서 로그인 폼이 아닌 BFF Route Handler를 통해 토큰을 받으므로
# tokenUrl은 문서화 목적으로만 사용되고 실제로는 /api/auth/login 을 가리킴
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def validate_password_policy(password: str) -> None:
    """비밀번호가 정책에 맞는지 검사하고, 아니면 400으로 거절한다.

    길이 검사가 변경·재설정 라우터에만 복사돼 있어 가입(register)과 관리자 계정
    생성에는 아예 없었다 — 1자리 비밀번호로도 계정이 만들어졌다. 비밀번호가
    새로 정해지는 네 경로가 모두 이 함수를 거치게 한다.

    스키마의 Field(min_length=...) 대신 함수로 둔 이유는 응답 형태 때문이다.
    프론트는 에러 사유를 `detail` "문자열"에서만 읽는데(authFetch.extractMessage),
    Pydantic 검증 실패는 detail 이 객체 배열이라 화면에 사유가 뜨지 않는다.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.",
        )


def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "type": "access", "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": subject, "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 토큰이 유효하지 않습니다.",
        ) from exc

    # access token으로 refresh 엔드포인트를 부르거나 그 반대로 쓰는 걸 막는다.
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 토큰이 유효하지 않습니다.",
        )
    return payload


def decode_access_token(token: str) -> dict:
    return _decode_token(token, "access")


def decode_refresh_token(token: str) -> dict:
    return _decode_token(token, "refresh")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_company_access(db: Session, user: User) -> None:
    """소속 기업이 접근 가능한 상태인지 검사한다 — 로그인·refresh·매 요청 공통.

    기업 정지(is_active=False)와 체험 만료는 "다음 토큰 갱신"이 아니라 즉시 반영돼야
    한다. 정리 잡이 아직 안 돌았어도 만료된 체험 계정은 여기서 바로 막힌다.
    dev 는 무소속(company_id NULL)이라 검사 대상이 아니다.
    """
    if user.company_id is None:
        return
    company = db.get(Company, user.company_id)
    if company is None or not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="소속 기업이 비활성화되었습니다."
        )
    if company.is_trial and company.expires_at is not None:
        expires = company.expires_at
        if expires.tzinfo is None:
            # SQLite 등 일부 백엔드는 naive 로 돌려준다 — 저장은 항상 UTC 기준.
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="체험 기간이 종료되었습니다."
            )


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증 토큰이 유효하지 않습니다.")

    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")

    ensure_company_access(db, user)
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    # dev(플랫폼 운영자)는 admin 의 상위 권한 — 기업 admin 이 하는 일은 전부 할 수 있다.
    if current_user.role not in ("admin", "dev"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
    return current_user


def require_dev(current_user: User = Depends(get_current_user)) -> User:
    """dev(플랫폼 운영자) 전용 — 기업·계정·예산 등 /api/dev/* 관리 경로의 가드."""
    if current_user.role != "dev":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="개발자 권한이 필요합니다.")
    return current_user
