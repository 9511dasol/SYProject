from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user_model import User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def create_user(self, email: str, password: str, name: str = "") -> User:
        user = User(email=email, name=name, hashed_password=hash_password(password))
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def authenticate(self, email: str, password: str) -> User | None:
        user = self.get_by_email(email)
        if user is None or not verify_password(password, user.hashed_password):
            return None
        return user
