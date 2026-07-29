"""add marketing_period_meta.media_budgets

Revision ID: 0005_media_budgets
Revises: 0004_task_store_login_lockout
Create Date: 2026-07-29

엑셀 summary 시트의 '■ 매체별 예산'은 템플릿에 상수로 박혀 있었다. 템플릿을 어느 달에도
속하지 않는 빈 파일로 만들면서, 이 값도 기간별로 DB에서 가져오게 옮긴다.

매체 수가 적고 항상 통째로 읽고 쓰므로 별도 테이블 대신 JSON 컬럼 하나로 둔다.
값 형태: {"네이버SA": 19000000, "카카오SA": 50000, "구글SA": 7000000, ...}

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_media_budgets"
down_revision: Union[str, None] = "0004_task_store_login_lockout"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "marketing_period_meta"
_COLUMN = "media_budgets"


def _column_names(bind, table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    bind = op.get_bind()
    json_type = postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON()
    if _COLUMN not in _column_names(bind, _TABLE):
        op.add_column(_TABLE, sa.Column(_COLUMN, json_type, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _COLUMN in _column_names(bind, _TABLE):
        op.drop_column(_TABLE, _COLUMN)
