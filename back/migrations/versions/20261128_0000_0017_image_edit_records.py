"""이미지 편집 기록 테이블 — 결과 이미지 서버 보관 (②-B)

Revision ID: 0017_image_edit_records
Revises: 0016_budget_id_seq
Create Date: 2026-11-28

"이미지는 서버에 저장하지 않는다"는 원래 설계를 사용자 결정으로 바꿨다 —
새로고침하면 작업물이 사라져 지난 작업을 이어갈 수 없었다. 확정 정책
(2026-11-27): 결과물만 보관, 14일 뒤 이미지 자동 삭제(레코드·프롬프트 유지),
스토리지 경로는 기업·사용자 단위 격리. 구조는 heading_suggestions 패턴을 따른다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0017_image_edit_records"
down_revision: Union[str, None] = "0016_budget_id_seq"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "image_edit_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "company_id",
            sa.Integer(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("image_filename", sa.String(255), nullable=False, server_default=""),
        sa.Column("prompt", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "image_paths",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("variant_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mime", sa.String(50), nullable=False, server_default="image/jpeg"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_image_edit_records_id", "image_edit_records", ["id"])
    op.create_index("ix_image_edit_records_user_id", "image_edit_records", ["user_id"])
    op.create_index("ix_image_edit_records_created_at", "image_edit_records", ["created_at"])
    op.create_index(
        "ix_image_edit_company_created", "image_edit_records", ["company_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("image_edit_records")
