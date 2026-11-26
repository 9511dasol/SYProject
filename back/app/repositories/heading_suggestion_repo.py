from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.models.heading_suggestion_model import HeadingSuggestion
from app.models.user_model import User


class HeadingSuggestionRepository:
    def __init__(self, db: Session):
        self.db = db

    def _query_for_user(self, user_id: int, q: str | None = None):
        query = self.db.query(HeadingSuggestion).filter(
            HeadingSuggestion.user_id == user_id
        )
        if q:
            # 파일명 + 문구 본문(JSON을 텍스트로 캐스팅)에서 찾는다. 예전에는 화면이
            # "이미 불러온 기록"만 걸러서, 오래된 문구는 전부 로드해야 찾을 수 있었다.
            # 사용자별 기록은 수백 건 수준이라 풀스캔 비용은 수용 가능하다.
            # (주의: SQLite 는 JSON 을 ASCII 이스케이프로 저장하므로 본문의 한글은
            #  로컬 sqlite 검증에서 안 걸릴 수 있다 — 운영 Postgres(JSONB)는 원문
            #  그대로 저장돼 정상 동작하고, 파일명 검색은 양쪽 모두 동작한다.)
            pattern = f"%{q}%"
            query = query.filter(
                or_(
                    HeadingSuggestion.image_filename.ilike(pattern),
                    cast(HeadingSuggestion.headings, String).ilike(pattern),
                )
            )
        return query

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
        # 소속 기업 기록 — dev(무소속)의 생성은 server_default(sy) 폴백에 맡긴다.
        if user.company_id is not None:
            record.company_id = user.company_id
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def list_for_user(
        self, user_id: int, *, limit: int = 20, offset: int = 0, q: str | None = None
    ) -> list[HeadingSuggestion]:
        return (
            self._query_for_user(user_id, q)
            # created_at 만으로 정렬하면 같은 초에 만들어진 기록의 순서가 페이지마다
            # 달라져 항목이 중복/누락될 수 있으므로 id 로 동점을 깬다.
            .order_by(HeadingSuggestion.created_at.desc(), HeadingSuggestion.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count_for_user(self, user_id: int, *, q: str | None = None) -> int:
        return self._query_for_user(user_id, q).count()

    def get(self, suggestion_id: int) -> HeadingSuggestion | None:
        return self.db.get(HeadingSuggestion, suggestion_id)

    def update_headings(
        self, record: HeadingSuggestion, headings: list[dict]
    ) -> HeadingSuggestion:
        """플랫폼별 재생성 결과를 기존 기록에 덮어쓴다 (이미지·파일명은 유지)."""
        record.headings = headings
        self.db.commit()
        self.db.refresh(record)
        return record

    def delete(self, record: HeadingSuggestion) -> None:
        self.db.delete(record)
        self.db.commit()
