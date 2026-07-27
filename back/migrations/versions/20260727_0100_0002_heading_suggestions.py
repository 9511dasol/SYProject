"""add heading_suggestions table

Revision ID: 0002_heading_suggestions
Revises: 0001_baseline
Create Date: 2026-07-27

헤딩 문구 추천 결과를 사용자별로 저장하는 heading_suggestions 테이블 추가.

멱등하게 작성한다: 이 프로젝트의 0001_baseline 은 `Base.metadata.create_all(checkfirst=True)`
로 "현재 모델 전체"를 동기화하므로, env.py 가 새 모델을 임포트하면 baseline 단계에서
이미 이 테이블이 만들어질 수 있다. 그 경우와 아직 없는 경우를 모두 안전하게 처리한다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_heading_suggestions"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "heading_suggestions"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE in inspector.get_table_names():
        return  # baseline 의 create_all 이 이미 생성한 경우

    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("image_filename", sa.String(length=255), nullable=False),
        sa.Column("image_path", sa.String(length=512), nullable=True),
        sa.Column("headings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_heading_suggestions_id"), _TABLE, ["id"])
    op.create_index(op.f("ix_heading_suggestions_user_id"), _TABLE, ["user_id"])
    op.create_index(op.f("ix_heading_suggestions_created_at"), _TABLE, ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return
    op.drop_index(op.f("ix_heading_suggestions_created_at"), table_name=_TABLE)
    op.drop_index(op.f("ix_heading_suggestions_user_id"), table_name=_TABLE)
    op.drop_index(op.f("ix_heading_suggestions_id"), table_name=_TABLE)
    op.drop_table(_TABLE)
