from datetime import date, datetime

from sqlalchemy import JSON, String, UniqueConstraint, and_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# 운영은 Postgres(JSONB), 테스트는 SQLite — SQLite에는 JSONB가 없어 JSON으로 떨어진다.
_JSON = JSONB().with_variant(JSON(), "sqlite")


class MarketingPeriodMeta(Base):
    """연월별 Excel summary 부가 정보 — 코멘트(B32)와 매체별 예산."""

    __tablename__ = "marketing_period_meta"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_period_year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    year: Mapped[int] = mapped_column(index=True)
    month: Mapped[int] = mapped_column(index=True)
    comment: Mapped[str] = mapped_column(default="")
    comment_updated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    # 이 코멘트를 만들 때 AI 에 보낸 프롬프트의 지문.
    # 같은 질문이면 같은 답이 나오므로, 지문이 일치하면 다시 묻지 않고 재사용한다.
    # 데이터가 바뀌거나 프롬프트 템플릿을 고치면 지문이 달라져 자동으로 다시 묻는다.
    # 사람이 엑셀에서 넣은 코멘트는 AI 가 만든 게 아니므로 NULL 로 둔다.
    comment_prompt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Supabase Storage 내 엑셀 원본의 object path (예: "2026/06/report.xlsx")
    excel_path: Mapped[str | None] = mapped_column(nullable=True)
    # summary 시트 ■ 매체별 예산 — {"네이버SA": 19000000, "카카오SA": 50000, ...}.
    # 광고 실적과 달리 업로드 엑셀에 없는 값이라 관리자가 기간별로 입력한다.
    media_budgets: Mapped[dict | None] = mapped_column(_JSON, nullable=True)


class MarketingData(Base):
    __tablename__ = "marketing_data"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_date: Mapped[date] = mapped_column(index=True)
    campaign_type: Mapped[str] = mapped_column(index=True)
    impressions: Mapped[int] = mapped_column(default=0)
    clicks: Mapped[int] = mapped_column(default=0)
    cost: Mapped[float] = mapped_column(default=0.0)
    conversions: Mapped[int] = mapped_column(default=0)
    conversion_revenue: Mapped[float] = mapped_column(default=0.0)
    signup: Mapped[float] = mapped_column(default=0.0)
    purchase: Mapped[float] = mapped_column(default=0.0)
    apply: Mapped[float] = mapped_column(default=0.0)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """해당 연월의 [시작일, 다음 달 1일) 경계."""
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def in_month(year: int, month: int):
    """report_date 가 해당 연월에 속한다는 조건.

    `extract('year', report_date) == year` 식으로 쓰면 컬럼에 함수가 적용돼
    report_date 인덱스를 타지 못하고 매번 전체 스캔이 된다. 뜻이 같은 범위 조건으로
    두면 인덱스를 쓴다 — 월별 조회·집계가 전부 이 경로를 지나므로 효과가 크다.
    """
    start, end = month_bounds(year, month)
    return and_(MarketingData.report_date >= start, MarketingData.report_date < end)


def resolve_total_conv(conversions, signup, purchase, apply) -> float:
    """총 전환수 = 세부 전환(회원가입·구매완료·신청) 합. 세부가 비어 있으면 conversions.

    conversions 는 정수 컬럼이라 구글 Ads 처럼 전환수가 소수로 오는 매체는 저장할 때
    소수점이 잘린다(하루 66.38건 → 66건). 세부 전환 3종은 실수 컬럼이라 값이 온전하게
    남으므로, 읽을 때 이쪽을 합해 쓰면 컬럼 타입을 바꾸지 않고도 정확해진다.

    세부가 전부 0이면 저장된 conversions 로 되돌아간다 — 세부 항목 컬럼이 없는 엑셀에서
    불러온 행은 총합만 갖고 있어서, 무조건 합산하면 그런 행이 0으로 보이기 때문이다.
    """
    breakdown = float(signup or 0) + float(purchase or 0) + float(apply or 0)
    return breakdown if breakdown else float(conversions or 0)