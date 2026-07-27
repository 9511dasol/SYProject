from sqlalchemy.orm import Session

from app.models.heading_suggestion_model import HeadingSuggestion
from app.models.user_model import User


class HeadingSuggestionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user: User,
        image_filename: str,
        headings: list[dict],
        image_path: str | None = None,
    ) -> HeadingSuggestion:
        record = HeadingSuggestion(
            user_id=user.id,
            user_email=user.email,
            image_filename=image_filename,
            image_path=image_path,
            headings=headings,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def list_for_user(self, user_id: int, *, limit: int = 20) -> list[HeadingSuggestion]:
        return (
            self.db.query(HeadingSuggestion)
            .filter(HeadingSuggestion.user_id == user_id)
            .order_by(HeadingSuggestion.created_at.desc())
            .limit(limit)
            .all()
        )

    def get(self, suggestion_id: int) -> HeadingSuggestion | None:
        return self.db.get(HeadingSuggestion, suggestion_id)

    def delete(self, record: HeadingSuggestion) -> None:
        self.db.delete(record)
        self.db.commit()
