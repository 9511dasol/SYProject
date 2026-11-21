"""keyword_watch / keyword_rank_snapshot 테이블 추가

Revision ID: 0009_keyword_rank_monitor
Revises: 0008_comment_prompt_hash
Create Date: 2026-11-18

키워드 순위 모니터링(M1) — 감시 키워드와 일 단위 순위 이력을 저장한다.
키워드 보고서 업로드로 평균 노출 순위를 적재하고, 목표 이탈 연속 횟수를
감시 행에 캐시해 둔다. 알림 발송(M3)은 별도 리비전에서 테이블을 추가한다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_keyword_rank_monitor"
down_revision: Union[str, None] = "0008_comment_prompt_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def upgrade() -> None:
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    tables = _existing_tables(op.get_bind())

    if "keyword_watch" not in tables:
        op.create_table(
            "keyword_watch",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("keyword", sa.String(length=100), nullable=False),
            sa.Column("device", sa.String(length=10), nullable=False),
            sa.Column("target_rank", sa.Float(), nullable=False),
            sa.Column("tolerance", sa.Float(), nullable=False),
            sa.Column("breaches_required", sa.Integer(), nullable=False),
            sa.Column("alert_on_no_impression", sa.Boolean(), nullable=False),
            sa.Column("color_tag", sa.String(length=10), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("breach_streak", sa.Integer(), nullable=False),
            sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("keyword", "device", name="uq_watch_keyword_device"),
        )
        op.create_index("ix_keyword_watch_id", "keyword_watch", ["id"])
        op.create_index("ix_keyword_watch_keyword", "keyword_watch", ["keyword"])

    if "keyword_rank_snapshot" not in tables:
        op.create_table(
            "keyword_rank_snapshot",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "watch_id",
                sa.Integer(),
                sa.ForeignKey("keyword_watch.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("stat_date", sa.Date(), nullable=False),
            sa.Column("avg_rank", sa.Float(), nullable=True),
            sa.Column("impressions", sa.Integer(), nullable=False),
            sa.Column("clicks", sa.Integer(), nullable=False),
            sa.Column("source", sa.String(length=10), nullable=False),
            sa.Column(
                "collected_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint(
                "watch_id", "stat_date", "source", name="uq_snapshot_watch_date_source"
            ),
        )
        op.create_index("ix_keyword_rank_snapshot_id", "keyword_rank_snapshot", ["id"])
        op.create_index(
            "ix_keyword_rank_snapshot_watch_id", "keyword_rank_snapshot", ["watch_id"]
        )
        op.create_index(
            "ix_snapshot_watch_date", "keyword_rank_snapshot", ["watch_id", "stat_date"]
        )


def downgrade() -> None:
    tables = _existing_tables(op.get_bind())
    if "keyword_rank_snapshot" in tables:
        op.drop_table("keyword_rank_snapshot")
    if "keyword_watch" in tables:
        op.drop_table("keyword_watch")
