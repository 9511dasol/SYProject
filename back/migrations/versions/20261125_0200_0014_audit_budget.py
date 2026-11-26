"""audit_logs 신설 + AI 예산 기업별 전환 (멀티테넌시 3/3)

Revision ID: 0014_audit_budget
Revises: 0013_tenant_columns
Create Date: 2026-11-25

1. audit_logs — 운영 행위 감사 기록(append-only). 행위자·대상에 FK 를 걸지 않는다:
   계정·기업이 삭제된 뒤에도 기록은 남아야 한다.
2. ai_usage_budget — 전역 싱글턴(id=1)을 기업당 1행으로 전환한다. 기존 id=1 행은
   company_id=1(sy) 로 귀속돼 sy 의 예산이 되고, "기업당 1행"은 unique 가 강제한다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0014_audit_budget"
down_revision: Union[str, None] = "0013_tenant_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 모델과 같은 방언별 타입 — Postgres 는 JSONB, 그 외(SQLite)는 JSON.
_JSON = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def _inspector(bind):
    return sa.inspect(bind)


def _columns(bind, table: str) -> set[str]:
    insp = _inspector(bind)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _unique_names(bind, table: str) -> set[str]:
    return {uq["name"] for uq in _inspector(bind).get_unique_constraints(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(_inspector(bind).get_table_names())

    # ── 1. audit_logs ────────────────────────────────────────────────────────
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    if "audit_logs" not in tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("actor_user_id", sa.Integer(), nullable=False),
            sa.Column("actor_email", sa.String(length=255), nullable=False),
            sa.Column("actor_role", sa.String(length=10), nullable=False),
            sa.Column("action", sa.String(length=50), nullable=False),
            sa.Column("target_type", sa.String(length=30), nullable=False),
            sa.Column("target_id", sa.String(length=64), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=True),
            sa.Column("detail", _JSON, nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index("ix_audit_logs_id", "audit_logs", ["id"])
        op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])
        op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
        op.create_index("ix_audit_company_created", "audit_logs", ["company_id", "created_at"])

    # ── 2. ai_usage_budget 기업별 전환 ───────────────────────────────────────
    if "ai_usage_budget" not in tables:
        return  # 0001_baseline 이전의 아주 오래된 DB — baseline 이 현재 모델로 만든다
    if "company_id" not in _columns(bind, "ai_usage_budget"):
        # 기존 싱글턴(id=1) 행이 server_default="1" 로 sy 의 예산이 된다.
        # SQLite 는 ALTER 로 FK 를 못 더하고 강제(PRAGMA)도 꺼진 로컬 전용 방언이라
        # FK 없이 컬럼만 더한다. 운영(Postgres)은 FK 포함.
        if bind.dialect.name == "sqlite":
            col = sa.Column(
                "company_id", sa.Integer(), nullable=False, server_default="1"
            )
        else:
            col = sa.Column(
                "company_id",
                sa.Integer(),
                sa.ForeignKey("companies.id", ondelete="CASCADE"),
                nullable=False,
                server_default="1",
            )
        op.add_column("ai_usage_budget", col)
    if "uq_ai_budget_company" not in _unique_names(bind, "ai_usage_budget"):
        with op.batch_alter_table("ai_usage_budget") as batch:
            batch.create_unique_constraint("uq_ai_budget_company", ["company_id"])


def downgrade() -> None:
    bind = op.get_bind()

    has_budget = "ai_usage_budget" in _inspector(bind).get_table_names()
    if has_budget and "uq_ai_budget_company" in _unique_names(bind, "ai_usage_budget"):
        with op.batch_alter_table("ai_usage_budget") as batch:
            batch.drop_constraint("uq_ai_budget_company", type_="unique")
    if has_budget and "company_id" in _columns(bind, "ai_usage_budget"):
        # 기업별 예산이 여럿이면 싱글턴으로 되돌릴 수 없다 — sy(id 최소) 행만 남긴다.
        op.execute(
            sa.text(
                "DELETE FROM ai_usage_budget WHERE id != (SELECT MIN(id) FROM ai_usage_budget)"
            )
        )
        with op.batch_alter_table("ai_usage_budget") as batch:
            batch.drop_column("company_id")

    if "audit_logs" in _inspector(bind).get_table_names():
        op.drop_table("audit_logs")
