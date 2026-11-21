"""keyword_watch 알림 상태 컬럼 + rank_alert_log 테이블 추가

Revision ID: 0010_rank_alerts
Revises: 0009_keyword_rank_monitor
Create Date: 2026-11-18

키워드 순위 모니터링(M3) — 목표 이탈이 연속되면 알림을 보내고, 같은 하락을 매일
다시 알리지 않도록 "이미 알렸음" 상태와 쿨다운을 감시 행에 둔다. 발송 이력은
report_log 와 같은 형태로 rank_alert_log 에 남긴다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_rank_alerts"
down_revision: Union[str, None] = "0009_keyword_rank_monitor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_WATCH = "keyword_watch"
_LOG = "rank_alert_log"


def _column_names(bind, table: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    bind = op.get_bind()
    existing = _column_names(bind, _WATCH)

    # 기존 행에도 값이 있어야 하므로 server_default 를 준다. 모델 기본값과 같은 값이다.
    if existing and "cooldown_hours" not in existing:
        op.add_column(
            _WATCH,
            sa.Column("cooldown_hours", sa.Integer(), nullable=False, server_default="24"),
        )
    if existing and "alerted" not in existing:
        op.add_column(
            _WATCH,
            sa.Column("alerted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if existing and "last_alerted_at" not in existing:
        op.add_column(_WATCH, sa.Column("last_alerted_at", sa.DateTime(timezone=True), nullable=True))

    if _LOG not in sa.inspect(bind).get_table_names():
        op.create_table(
            _LOG,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "watch_id",
                sa.Integer(),
                sa.ForeignKey("keyword_watch.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("keyword", sa.String(length=100), nullable=False),
            sa.Column("device", sa.String(length=10), nullable=False),
            sa.Column("alert_type", sa.String(length=12), nullable=False),
            sa.Column("target_rank", sa.Float(), nullable=False),
            sa.Column("curr_rank", sa.Float(), nullable=True),
            sa.Column("prev_rank", sa.Float(), nullable=True),
            sa.Column("breach_streak", sa.Integer(), nullable=False),
            sa.Column("recipients", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("error_msg", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index("ix_rank_alert_log_id", _LOG, ["id"])
        op.create_index("ix_rank_alert_log_watch_id", _LOG, ["watch_id"])
        op.create_index("ix_rank_alert_log_created_at", _LOG, ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    if _LOG in sa.inspect(bind).get_table_names():
        op.drop_table(_LOG)

    existing = _column_names(bind, _WATCH)
    for column in ("last_alerted_at", "alerted", "cooldown_hours"):
        if column in existing:
            op.drop_column(_WATCH, column)
