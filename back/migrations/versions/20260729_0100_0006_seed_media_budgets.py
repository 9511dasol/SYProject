"""seed marketing_period_meta.media_budgets with the values that were in the template

Revision ID: 0006_seed_media_budgets
Revises: 0005_media_budgets
Create Date: 2026-07-29

0005 로 예산 칸을 DB로 옮겼지만 값이 하나도 없으면 엑셀의 예산소진율은 빈칸,
잔여광고비는 음수, 달성비율은 -100% 로 나온다. 그래서 지금까지 템플릿에 상수로
박혀 있던 값을 그대로 한 번 넣어 준다 — 배포 직후에도 이전과 같은 숫자가 나오고,
예산이 바뀐 달만 관리자 화면에서 고쳐 쓰면 된다.

가장 오래된 데이터 기간에 넣는다. 예산은 그보다 뒤 기간이 값을 이어받으므로
(MarketingRepository.get_media_budgets) 한 곳만 채우면 전 기간이 덮인다.
이는 옛 템플릿이 모든 달에 같은 예산을 쓰던 동작과 정확히 같다.

이미 어느 기간이든 예산이 들어 있으면 아무것도 하지 않는다 — 관리자가 손으로 넣은
값을 되돌리지 않기 위함이다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_seed_media_budgets"
down_revision: Union[str, None] = "0005_media_budgets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

# 옛 report_template.xlsx summary 시트 '■ 매체별 예산' D21~D27 에 있던 값.
# 키는 marketing_data.campaign_type (= 엑셀 서비스의 매체 레이블) 을 따른다.
SEED_BUDGETS: dict[str, float] = {
    "네이버SA":  19_000_000,
    "카카오SA":      50_000,
    "구글SA":     7_000_000,
    "네이버BS":   8_000_000,
    "네이버PSA":  5_000_000,
}

_META = "marketing_period_meta"
_DATA = "marketing_data"


def _meta_table(bind) -> sa.Table:
    """마이그레이션은 모델을 임포트하지 않는다 — 필요한 컬럼만 여기서 다시 선언한다."""
    json_type = postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON()
    return sa.Table(
        _META,
        sa.MetaData(),
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("year", sa.Integer),
        sa.Column("month", sa.Integer),
        sa.Column("comment", sa.String),
        sa.Column("media_budgets", json_type),
    )


def _earliest_period(bind) -> tuple[int, int] | None:
    """예산을 심을 기간 — 가장 오래된 데이터가 있는 연월.

    컬럼 타입을 선언한 select 로 읽는다. 생 SQL 로 읽으면 SQLite 가 날짜를 문자열로
    돌려줘 .year 접근이 깨진다 (Postgres 는 date 객체를 준다).
    """
    data = sa.Table(
        _DATA,
        sa.MetaData(),
        sa.Column("report_date", sa.Date),
    )
    first = bind.execute(sa.select(sa.func.min(data.c.report_date))).scalar()
    return (first.year, first.month) if first is not None else None


def upgrade() -> None:
    bind = op.get_bind()
    meta = _meta_table(bind)

    already = bind.execute(
        sa.select(sa.func.count()).select_from(meta).where(meta.c.media_budgets.isnot(None))
    ).scalar()
    if already:
        logger.info("매체별 예산이 이미 %d개 기간에 설정돼 있어 시드를 건너뜁니다.", already)
        return

    period = _earliest_period(bind)
    if period is None:
        logger.info("marketing_data 가 비어 있어 예산 시드를 건너뜁니다.")
        return

    year, month = period
    row_id = bind.execute(
        sa.select(meta.c.id).where(meta.c.year == year, meta.c.month == month)
    ).scalar()

    if row_id is None:
        bind.execute(
            meta.insert().values(year=year, month=month, comment="", media_budgets=SEED_BUDGETS)
        )
    else:
        bind.execute(meta.update().where(meta.c.id == row_id).values(media_budgets=SEED_BUDGETS))

    logger.info("%d년 %d월에 매체별 예산 기본값을 심었습니다 (이후 기간이 이어받음).", year, month)


def downgrade() -> None:
    """되돌리지 않는다.

    심은 뒤 관리자가 화면에서 고쳤을 수 있어, 여기서 지우면 그 수정까지 함께 날아간다.
    컬럼 자체를 없애려면 0005 까지 내리면 된다.
    """
