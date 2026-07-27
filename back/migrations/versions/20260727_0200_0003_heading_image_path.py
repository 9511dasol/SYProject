"""add image_path column to heading_suggestions

Revision ID: 0003_heading_image_path
Revises: 0002_heading_suggestions
Create Date: 2026-07-27

0002 가 이미 적용된 기존 DB에는 image_path 컬럼이 없으므로 추가한다.
멱등하게 작성: 신규 DB에서 baseline 의 create_all(모델 기준)이 이미 컬럼을
만들어 둔 경우엔 건너뛴다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_heading_image_path"
down_revision: Union[str, None] = "0002_heading_suggestions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "heading_suggestions"
_COL = "image_path"


def _has_column(bind) -> bool:
    return _COL in {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind):
        op.add_column(_TABLE, sa.Column(_COL, sa.String(length=512), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind):
        op.drop_column(_TABLE, _COL)
