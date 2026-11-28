from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import PORTABLE_JSON, Base


class ImageEditRecord(Base):
    """이미지 편집 전송 1회의 기록 — 지시(프롬프트)와 생성 결과 이미지.

    2026-11-27 고객사 제보 ②-B. "이미지는 서버에 저장하지 않는다"는 원래 설계를
    사용자 결정으로 바꾼 지점이다 — 새로고침하면 작업물이 사라져 지난 작업을
    이어갈 수 없었다. 확정 정책:

      - **결과물만** 보관한다. 업로드 원본은 지금처럼 메모리 처리 후 폐기 —
        원본에는 인물·타사 저작물이 섞일 수 있어 보관 범위를 최소로 유지한다.
      - 이미지는 `IMAGE_EDIT_RETENTION_DAYS`(기본 14일) 뒤 자동 삭제되고,
        **레코드(프롬프트)는 남는다** — 만료 표시와 지시 재사용을 위해서다.
        만료는 image_paths 가 빈 리스트가 되는 것으로 표현한다. variant_count
        를 따로 두는 이유다: 경로가 비어도 "그때 몇 장이었는지"는 보여야 한다.
      - 스토리지 경로는 기업·사용자 단위로 나눈다 — 11-26 에 겪은 "다른 기업
        데이터가 섞여 보이는" 사고를 이미지에서 반복하지 않기 위해서다.
    """

    __tablename__ = "image_edit_records"
    __table_args__ = (
        Index("ix_image_edit_company_created", "company_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 소속 기업 — 생성 경로가 반드시 명시한다 (기본값 없음: 빠뜨리면 그 자리에서 실패).
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    # 그때 올린 원본의 파일명 — 참고용. 원본 바이트는 저장하지 않는다.
    image_filename: Mapped[str] = mapped_column(String(255), default="")
    # 대화(스레드) 식별자 — 같은 작업에서 이어 보낸 전송들을 한 대화로 묶는다.
    # 파일명으로 묶으면 이름이 같은 다른 이미지가 한 대화로 합쳐지고, 결과를 이어
    # 편집해 이름이 달라지면 같은 작업이 여러 대화로 쪼개진다. 화면이 작업을 시작할
    # 때 만들어 보내는 값이고, 이 컬럼이 생기기 전 기록과 구버전 클라이언트는 NULL
    # 이다(화면이 파일명 묶음으로 폴백한다).
    thread_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    prompt: Mapped[str] = mapped_column(Text, default="")
    # Supabase Storage object path 목록 (시안 순서대로). 만료되면 [] 가 된다.
    image_paths: Mapped[list[str]] = mapped_column(PORTABLE_JSON, default=list)
    # 생성 당시 장수 — 만료 후에도 "시안 4장 (만료)" 로 보여야 하므로 따로 든다.
    variant_count: Mapped[int] = mapped_column(Integer, default=0)
    mime: Mapped[str] = mapped_column(String(50), default="image/jpeg")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    @property
    def images_available(self) -> bool:
        return bool(self.image_paths)

    @property
    def image_count(self) -> int:
        """실제 보관된 장수 — 업로드가 일부 실패하면 variant_count 보다 적을 수 있다.

        화면은 이 수만큼 썸네일을 그려야 한다. variant_count 로 그리면 없는
        인덱스가 404 로 깨진 이미지가 된다.
        """
        return len(self.image_paths or [])
