"""companies 신설 + users 역할 4종 전환 (멀티테넌시 1/3)

Revision ID: 0012_companies_roles
Revises: 0011_rank_api_collect
Create Date: 2026-11-25

멀티테넌시 개편(docs/멀티테넌시-DB설계.md)의 첫 단계 — 테넌트의 뿌리를 만든다.

1. companies 테이블 생성 + 첫 기업 "sy"(id=1) 시드.
   기존 데이터 전부가 sy 소속이 된다. 각 테이블의 과도기 server_default="1" 이
   이 id 를 전제하므로 반드시 id=1 로 시드한다.
2. users.company_id 추가(FK, dev 만 NULL) + 구 역할값 변환(user → member).
3. 불변식을 DB 제약으로: dev 만 무소속(CHECK), 기업당 admin 1개(partial unique).
   기존 admin 이 여러 명이면 id 가 가장 작은 1명만 남기고 member 로 강등한다 —
   그래야 partial unique index 가 실패 없이 걸린다.

dev 계정 승격은 여기서 하지 않는다 — 특정 이메일을 박으면 마이그레이션의 결정성이
깨진다. scripts/promote_dev.py 로 분리했다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012_companies_roles"
down_revision: Union[str, None] = "0011_rank_api_collect"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector(bind):
    return sa.inspect(bind)


def _columns(bind, table: str) -> set[str]:
    insp = _inspector(bind)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _index_names(bind, table: str) -> set[str]:
    return {ix["name"] for ix in _inspector(bind).get_indexes(table)}


def _check_names(bind, table: str) -> set[str]:
    try:
        return {c["name"] for c in _inspector(bind).get_check_constraints(table)}
    except NotImplementedError:
        return set()


def _company_column(bind, *, nullable: bool) -> sa.Column:
    """company_id 컬럼 정의 — SQLite 는 ALTER 로 FK 를 못 더하고, 강제(PRAGMA)도
    꺼져 있는 로컬 전용 방언이므로 FK 없이 컬럼만 더한다. 운영(Postgres)은 FK 포함."""
    if bind.dialect.name == "sqlite":
        return sa.Column("company_id", sa.Integer(), nullable=nullable, server_default="1")
    return sa.Column(
        "company_id",
        sa.Integer(),
        sa.ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=nullable,
        server_default="1",
    )


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(_inspector(bind).get_table_names())

    # ── 1. companies ─────────────────────────────────────────────────────────
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    if "companies" not in tables:
        op.create_table(
            "companies",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=100), nullable=False, unique=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("is_trial", sa.Boolean(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index("ix_companies_id", "companies", ["id"])
        op.create_index("ix_companies_trial_expiry", "companies", ["is_trial", "expires_at"])

    # sy 시드 — id=1 고정 (과도기 server_default="1" 과 0013 백필이 이 값을 전제한다)
    companies = sa.table(
        "companies",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("is_trial", sa.Boolean),
    )
    has_sy = bind.execute(sa.text("SELECT 1 FROM companies WHERE id = 1")).first()
    if not has_sy:
        op.execute(
            companies.insert().values(id=1, name="sy", is_active=True, is_trial=False)
        )
        if bind.dialect.name == "postgresql":
            # 명시 id 삽입은 시퀀스를 올리지 않는다 — 다음 INSERT 가 id=1 과
            # 충돌하지 않게 시퀀스를 현재 최대값으로 보정한다.
            op.execute(
                sa.text(
                    "SELECT setval(pg_get_serial_sequence('companies','id'),"
                    " (SELECT MAX(id) FROM companies))"
                )
            )

    # ── 2. users.company_id + 역할값 변환 ────────────────────────────────────
    if "company_id" not in _columns(bind, "users"):
        op.add_column("users", _company_column(bind, nullable=True))
    if "ix_users_company_id" not in _index_names(bind, "users"):
        op.create_index("ix_users_company_id", "users", ["company_id"])

    # 구 역할값 변환 + 백필. ADD COLUMN 의 server_default 가 기존 행을 1 로 채우지만,
    # 혹시 남은 NULL(dev 제외)은 명시적으로 메운다.
    op.execute(sa.text("UPDATE users SET role = 'member' WHERE role = 'user'"))
    op.execute(
        sa.text(
            "UPDATE users SET company_id = 1 WHERE company_id IS NULL AND role != 'dev'"
        )
    )

    # ── 3. 불변식 제약 ───────────────────────────────────────────────────────
    # 기업당 admin 1개를 걸기 전에, 중복 admin 은 최선임(id 최소) 1명만 남긴다.
    op.execute(
        sa.text(
            "UPDATE users SET role = 'member' "
            "WHERE role = 'admin' AND id NOT IN ("
            " SELECT MIN(id) FROM users WHERE role = 'admin' GROUP BY company_id)"
        )
    )

    if "ck_users_dev_no_company" not in _check_names(bind, "users"):
        with op.batch_alter_table("users") as batch:
            batch.create_check_constraint(
                "ck_users_dev_no_company", "(role = 'dev') = (company_id IS NULL)"
            )

    if "uq_one_admin_per_company" not in _index_names(bind, "users"):
        op.create_index(
            "uq_one_admin_per_company",
            "users",
            ["company_id"],
            unique=True,
            postgresql_where=sa.text("role = 'admin'"),
            sqlite_where=sa.text("role = 'admin'"),
        )


def downgrade() -> None:
    bind = op.get_bind()

    if "uq_one_admin_per_company" in _index_names(bind, "users"):
        op.drop_index("uq_one_admin_per_company", table_name="users")
    if "ck_users_dev_no_company" in _check_names(bind, "users"):
        with op.batch_alter_table("users") as batch:
            batch.drop_constraint("ck_users_dev_no_company", type_="check")
    op.execute(sa.text("UPDATE users SET role = 'member' WHERE role = 'dev'"))
    op.execute(sa.text("UPDATE users SET role = 'user' WHERE role = 'member'"))
    if "ix_users_company_id" in _index_names(bind, "users"):
        op.drop_index("ix_users_company_id", table_name="users")
    if "company_id" in _columns(bind, "users"):
        with op.batch_alter_table("users") as batch:
            batch.drop_column("company_id")
    if "companies" in _inspector(bind).get_table_names():
        op.drop_table("companies")
