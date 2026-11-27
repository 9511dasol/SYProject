from datetime import datetime

from sqlalchemy.orm import Session

from app.models.image_edit_record_model import ImageEditRecord
from app.models.user_model import User


class ImageEditRecordRepository:
    """이미지 편집 기록 — 조회는 전부 기업 + 본인 범위다.

    기업 범위만으로 끊으면 같은 회사 동료의 작업물이 보이고, 기업 필터를
    빠뜨리면 다른 고객사 기록까지 샌다(11-26 에 실제로 겪은 사고다). 두 조건을
    시그니처가 강제해 호출부가 빠뜨릴 수 없게 한다.
    """

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user: User,
        company_id: int,
        image_filename: str,
        prompt: str,
        image_paths: list[str],
        variant_count: int,
        mime: str,
    ) -> ImageEditRecord:
        record = ImageEditRecord(
            company_id=company_id,
            user_id=user.id,
            user_email=user.email,
            image_filename=image_filename,
            prompt=prompt,
            image_paths=image_paths,
            variant_count=variant_count,
            mime=mime,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def _scoped(self, company_id: int, user_id: int):
        return (
            self.db.query(ImageEditRecord)
            .filter(ImageEditRecord.company_id == company_id)
            .filter(ImageEditRecord.user_id == user_id)
        )

    def list_for_user(
        self, *, company_id: int, user_id: int, limit: int = 20, offset: int = 0
    ) -> list[ImageEditRecord]:
        return (
            self._scoped(company_id, user_id)
            .order_by(ImageEditRecord.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count_for_user(self, *, company_id: int, user_id: int) -> int:
        return self._scoped(company_id, user_id).count()

    def get_for_user(
        self, record_id: int, *, company_id: int, user_id: int
    ) -> ImageEditRecord | None:
        return self._scoped(company_id, user_id).filter(ImageEditRecord.id == record_id).first()

    def delete(self, record: ImageEditRecord) -> None:
        self.db.delete(record)
        self.db.commit()

    # ── 보관 기간 정리 ────────────────────────────────────────────────────────

    def list_expired(self, cutoff: datetime) -> list[ImageEditRecord]:
        """이미지가 아직 남아 있는 만료 레코드 — 정리 크론이 객체를 지울 대상."""
        return (
            self.db.query(ImageEditRecord)
            .filter(ImageEditRecord.created_at < cutoff)
            .filter(ImageEditRecord.image_paths != [])
            .all()
        )

    def clear_images(self, record: ImageEditRecord) -> None:
        """스토리지 객체를 지운 뒤 호출 — 레코드는 만료 상태([])로 남긴다."""
        record.image_paths = []
        self.db.commit()

    def list_paths_for_company(self, company_id: int) -> list[str]:
        """기업의 모든 이미지 경로 — 체험 기업 정리 시 스토리지까지 같이 지우기 위한 것.

        DB 행은 기업 삭제의 FK CASCADE 가 지우지만, 스토리지 객체는 아무도 지워
        주지 않아 고아로 쌓인다. 삭제 전에 이 목록으로 객체를 먼저 지운다.
        """
        rows = (
            self.db.query(ImageEditRecord.image_paths)
            .filter(ImageEditRecord.company_id == company_id)
            .all()
        )
        return [path for (paths,) in rows for path in paths or []]
