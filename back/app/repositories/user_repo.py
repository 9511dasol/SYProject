from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.core.settings import settings
from app.models.user_model import User


class AccountLockedError(Exception):
    """연속 로그인 실패로 계정이 일시 잠긴 상태.

    retry_after_seconds: 잠금이 풀릴 때까지 남은 시간(초).
    """

    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"계정이 잠겼습니다. {retry_after_seconds}초 후 다시 시도하세요.")


def _as_utc(value: datetime) -> datetime:
    """naive datetime을 UTC로 간주해 aware로 맞춘다.

    Postgres의 TIMESTAMPTZ는 aware 값을 돌려주지만 SQLite 등 일부 백엔드는 naive를
    돌려줘서, 그대로 비교하면 TypeError가 난다.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def list_all(self) -> list[User]:
        return self.db.query(User).order_by(User.id).all()

    def create_user(self, email: str, password: str, name: str = "", role: str = "user") -> User:
        user = User(email=email, name=name, hashed_password=hash_password(password), role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def authenticate(self, email: str, password: str) -> User | None:
        """비밀번호를 검증한다.

        연속 실패가 LOGIN_MAX_FAILED_ATTEMPTS에 닿으면 LOGIN_LOCKOUT_MINUTES 동안
        해당 계정의 로그인을 막는다(AccountLockedError). 성공하면 카운터를 초기화한다.
        존재하지 않는 이메일은 카운터를 남길 대상이 없으므로 그대로 None을 반환한다 —
        계정 존재 여부가 응답으로 드러나지 않도록 라우터에서 동일한 메시지를 쓴다.
        """
        user = self.get_by_email(email)
        if user is None:
            return None

        now = datetime.now(timezone.utc)
        if user.locked_until is not None:
            locked_until = _as_utc(user.locked_until)
            if locked_until > now:
                raise AccountLockedError(int((locked_until - now).total_seconds()) + 1)

        if not verify_password(password, user.hashed_password):
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
                self.db.commit()
                raise AccountLockedError(settings.LOGIN_LOCKOUT_MINUTES * 60)
            self.db.commit()
            return None

        if user.failed_login_attempts or user.locked_until:
            user.failed_login_attempts = 0
            user.locked_until = None
            self.db.commit()
        return user

    def set_role(self, user_id: int, role: str) -> User | None:
        user = self.get_by_id(user_id)
        if user is None:
            return None
        user.role = role
        self.db.commit()
        self.db.refresh(user)
        return user

    def set_active(self, user_id: int, is_active: bool) -> User | None:
        user = self.get_by_id(user_id)
        if user is None:
            return None
        user.is_active = is_active
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_profile(self, user: User, name: str | None = None, email: str | None = None) -> User:
        if name is not None:
            user.name = name
        if email is not None:
            user.email = email
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_password(self, user: User, new_password: str) -> None:
        user.hashed_password = hash_password(new_password)
        self.db.commit()
