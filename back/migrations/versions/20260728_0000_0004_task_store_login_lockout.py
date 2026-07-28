"""add background_tasks / undo_snapshots tables and user login lockout columns

Revision ID: 0004_task_store_login_lockout
Revises: 0003_heading_image_path
Create Date: 2026-07-28

백그라운드 작업 상태와 업로드 되돌리기 스냅샷을 프로세스 메모리에서 DB로 옮긴다.
함께 users에 로그인 실패 카운터/잠금 시각 컬럼을 추가한다.

이 프로젝트의 0001_baseline 은 `Base.metadata.create_all(checkfirst=True)` 로
"현재 모델 전체"를 동기화하므로, 신규 DB에서는 baseline 단계에 이미 만들어졌을 수 있다.
그 경우와 아직 없는 경우를 모두 안전하게 처리한다(멱등).

주의: 리비전 ID는 32자를 넘으면 안 된다. alembic_version.version_num 이
VARCHAR(32) 라서, DDL 이 다 끝난 뒤 버전 기록 단계에서 실패하고 트랜잭션이
통째로 롤백된다(= 마이그레이션이 조용히 적용되지 않은 것처럼 보인다).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_task_store_login_lockout"
down_revision: Union[str, None] = "0003_heading_image_path"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TASKS = "background_tasks"
_UNDO = "undo_snapshots"
_USERS = "users"


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if _TASKS not in tables:
        op.create_table(
            _TASKS,
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("progress", sa.Integer(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("cancelled", sa.Boolean(), nullable=False),
            sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("result_blob", sa.LargeBinary(), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
        )
        op.create_index(op.f("ix_background_tasks_kind"), _TASKS, ["kind"])
        op.create_index(op.f("ix_background_tasks_user_id"), _TASKS, ["user_id"])
        op.create_index(op.f("ix_background_tasks_created_at"), _TASKS, ["created_at"])

    if _UNDO not in tables:
        op.create_table(
            _UNDO,
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("rows", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
        )
        op.create_index(op.f("ix_undo_snapshots_created_at"), _UNDO, ["created_at"])

    user_columns = _column_names(bind, _USERS)
    if "failed_login_attempts" not in user_columns:
        op.add_column(
            _USERS,
            sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
        )
    if "locked_until" not in user_columns:
        op.add_column(_USERS, sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    user_columns = _column_names(bind, _USERS)
    if "locked_until" in user_columns:
        op.drop_column(_USERS, "locked_until")
    if "failed_login_attempts" in user_columns:
        op.drop_column(_USERS, "failed_login_attempts")

    tables = _table_names(bind)
    if _UNDO in tables:
        op.drop_index(op.f("ix_undo_snapshots_created_at"), table_name=_UNDO)
        op.drop_table(_UNDO)
    if _TASKS in tables:
        op.drop_index(op.f("ix_background_tasks_created_at"), table_name=_TASKS)
        op.drop_index(op.f("ix_background_tasks_user_id"), table_name=_TASKS)
        op.drop_index(op.f("ix_background_tasks_kind"), table_name=_TASKS)
        op.drop_table(_TASKS)
