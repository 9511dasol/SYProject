"""키워드 순위 모니터링 — 감시 대상과 순위 이력.

매일 아침 키워드별 노출 순위를 손으로 확인하던 작업을 대신한다. 감시할 키워드와
목표 순위를 등록해 두면, 키워드 보고서 업로드(1단계) 또는 API 수집(2단계)으로
순위가 적재되고, 목표 이탈이 연속되면 알림(3단계)으로 이어진다.

순위의 출처별 한계: 업로드/API 로 얻는 값은 "평균 노출 순위"라 일 단위 지표다.
실시간 순위 수집(검색결과 크롤링)은 매체 약관 위반 소지가 있어 쓰지 않는다.
"""

from datetime import date, datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import PORTABLE_JSON, Base



class KeywordWatch(Base):
    """감시 대상 키워드 1건 — 목표 순위와 이탈 판정 기준을 함께 갖는다."""

    __tablename__ = "keyword_watch"
    __table_args__ = (
        # 같은 키워드를 같은 디바이스로 두 번 감시하면 이력이 갈라져 어느 쪽이
        # 진짜인지 알 수 없게 된다. 등록 단계에서 막는다.
        UniqueConstraint("keyword", "device", name="uq_watch_keyword_device"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    keyword: Mapped[str] = mapped_column(String(100), index=True)
    device: Mapped[str] = mapped_column(String(10), default="all")  # "all" | "pc" | "mobile"

    # 판정 기준. 평균 노출 순위는 소수(예: 2.7)로 오므로 목표도 실수로 둔다.
    target_rank: Mapped[float] = mapped_column(default=3.0)
    # 목표를 얼마나 넘어야 "이탈"로 보는지. 2.9→3.4 같은 미세한 흔들림까지
    # 이탈로 세면 알림이 소음이 된다.
    tolerance: Mapped[float] = mapped_column(default=0.5)
    # 연속 몇 **번의 기록**이 이탈해야 알림 대상으로 보는지 — 한 번 튄 값으로 오보를
    # 내지 않기 위함. 날짜가 아니라 기록 수다(업로드가 매일이라는 보장이 없다).
    breaches_required: Mapped[int] = mapped_column(default=2)
    # 보고서에 노출 0(순위 없음)으로 적힌 날을 이탈로 칠지.
    # 보고서에서 키워드가 **아예 빠진** 경우는 기록 자체가 없어 여기 해당하지 않는다 —
    # 그런 키워드는 적재 응답의 watches_no_data 로 알린다.
    alert_on_no_impression: Mapped[bool] = mapped_column(default=True)

    # 중요도 색상 태그 — 목록 상단 고정·그룹 정렬용 (프론트 단계에서 사용).
    color_tag: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # 같은 하락을 매일 다시 알리지 않기 위한 최소 간격.
    cooldown_hours: Mapped[int] = mapped_column(default=24)

    status: Mapped[str] = mapped_column(String(20), default="active")  # "active" | "paused"
    # 최신 적재 기준 연속 이탈 횟수. 이력에서 재계산해 넣으므로 재업로드에도 안전하다.
    breach_streak: Mapped[int] = mapped_column(default=0)
    # 하락을 이미 알린 상태인지 — 켜져 있으면 다시 알리지 않고, 목표로 복귀하면
    # "회복" 알림을 한 번 보내고 꺼진다. 이게 없으면 업로드할 때마다 같은 하락을 알린다.
    alerted: Mapped[bool] = mapped_column(default=False)
    last_alerted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── API 자동 수집(M2)용 ───────────────────────────────────────────────────
    # 이 키워드에 해당하는 네이버 광고 키워드 ID 목록. 같은 키워드가 여러 광고그룹에
    # 등록돼 있을 수 있어 복수다. 계정 전체를 훑어야 얻을 수 있는 값이라(광고그룹
    # 수백 개 = 호출 수백 번) 한 번 찾으면 저장해 두고 재사용한다.
    nv_keyword_ids: Mapped[list | None] = mapped_column(PORTABLE_JSON, nullable=True)
    nv_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 마지막 수집 실패 원인 — "오류"로 뭉뚱그리지 않고 코드로 남겨 화면이 조치를 안내한다.
    # (AUTH_ERROR / QUOTA_EXCEEDED / KEYWORD_NOT_FOUND / PROVIDER_DOWN …)
    last_error_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # 등록자 기록용 — 감시 대상 자체는 팀 공용이다.
    # 타입을 명시하는 이유: 생략하면 SQLAlchemy 가 FK 가 가리키는 컬럼에서 타입을
    # 가져오는데, users 모델이 아직 임포트되지 않은 상태에서 이 테이블만 만들면
    # 타입을 못 찾아 DDL 생성이 실패한다(임포트 순서에 따라 되다 안 되다 한다).
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class KeywordRankSnapshot(Base):
    """키워드 하루치 순위 기록 — 감시 키워드당 (날짜, 출처)별 1행."""

    __tablename__ = "keyword_rank_snapshot"
    __table_args__ = (
        # 같은 날짜 보고서를 다시 올리면 새 행이 아니라 갱신이어야 한다(멱등).
        UniqueConstraint(
            "watch_id", "stat_date", "source", name="uq_snapshot_watch_date_source"
        ),
        # 이력 조회·연속 이탈 재계산이 전부 (watch_id, stat_date DESC) 경로를 지난다.
        Index("ix_snapshot_watch_date", "watch_id", "stat_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    watch_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("keyword_watch.id", ondelete="CASCADE"), index=True
    )
    stat_date: Mapped[date]
    # None = 해당 날짜 노출 없음. 0 으로 두면 "1위보다 좋은 순위"처럼 읽혀 버린다.
    avg_rank: Mapped[float | None] = mapped_column(nullable=True)
    impressions: Mapped[int] = mapped_column(default=0)
    clicks: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(10), default="upload")  # "upload" | "api"
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
