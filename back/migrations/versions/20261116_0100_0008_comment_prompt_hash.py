"""add marketing_period_meta.comment_prompt_hash

Revision ID: 0008_comment_prompt_hash
Revises: 0007_usage_log_indexes
Create Date: 2026-11-16

AI 코멘트는 같은 데이터로 다시 눌러도 매번 LLM 을 호출했다. 같은 질문이면 같은 답이
나오므로 토큰만 더 쓰는 셈이다. 코멘트를 만들 때 보낸 프롬프트의 지문을 함께 저장해,
지문이 같으면 다시 묻지 않고 저장된 코멘트를 재사용한다.

데이터가 바뀌거나 프롬프트 템플릿을 고치면 지문이 달라져 자동으로 다시 생성된다.
사람이 엑셀에서 넣은 코멘트는 AI 산출물이 아니므로 NULL 로 둔다(= 캐시 없음).

기존 행은 NULL 로 남으므로 다음 생성 때 한 번 호출되고, 그 뒤부터 재사용된다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_comment_prompt_hash"
down_revision: Union[str, None] = "0007_usage_log_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "marketing_period_meta"
_COLUMN = "comment_prompt_hash"


def _column_names(bind, table: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    bind = op.get_bind()
    if _COLUMN not in _column_names(bind, _TABLE):
        op.add_column(_TABLE, sa.Column(_COLUMN, sa.String(64), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _COLUMN in _column_names(bind, _TABLE):
        op.drop_column(_TABLE, _COLUMN)
