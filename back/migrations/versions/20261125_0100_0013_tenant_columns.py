"""전 비즈니스 테이블에 company_id 전파 (멀티테넌시 2/3)

Revision ID: 0013_tenant_columns
Revises: 0012_companies_roles
Create Date: 2026-11-25

테넌트 소속 테이블 11종에 company_id 를 추가하고 기존 데이터를 sy(id=1)로 귀속시킨다.
모든 테이블이 company_id 를 **직접** 보유한다(keyword_rank_snapshot 처럼 조인으로
추적 가능한 테이블도) — RLS 정책과 리포지토리 스코핑이 전 테이블에서 같은 단순
비교(company_id = ?)가 되게 하기 위해서다.

- background_tasks 만 NULL 허용: 어느 기업 것도 아닌 전역 시스템 잡이 함께 기록된다.
- 유니크 제약 2건은 기업 범위로 교체한다: 다른 기업이 같은 연월(marketing_period_meta)·
  같은 키워드(keyword_watch)를 쓸 수 있어야 한다.
- server_default="1" 은 과도기용: 테넌트 스코핑이 전 경로에 깔리면 제거한다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013_tenant_columns"
down_revision: Union[str, None] = "0012_companies_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (테이블, nullable, 인덱스명, 인덱스 컬럼, 교체할 유니크 (기존명, 새명, 새 컬럼))
_SPECS: list[dict] = [
    {
        "table": "marketing_period_meta",
        "uq": ("uq_period_year_month", "uq_period_company_year_month", ["company_id", "year", "month"]),
    },
    {"table": "marketing_data", "index": ("ix_marketing_company_date", ["company_id", "report_date"])},
    {"table": "ai_tool_usage_logs", "index": ("ix_ai_usage_company_created", ["company_id", "created_at"])},
    {"table": "report_log", "index": ("ix_report_log_company_created", ["company_id", "created_at"])},
    {"table": "heading_suggestions", "index": ("ix_heading_company_created", ["company_id", "created_at"])},
    {
        "table": "keyword_watch",
        "uq": ("uq_watch_keyword_device", "uq_watch_company_keyword_device", ["company_id", "keyword", "device"]),
    },
    {"table": "keyword_rank_snapshot", "index": ("ix_keyword_rank_snapshot_company_id", ["company_id"])},
    {"table": "rank_alert_log", "index": ("ix_rank_alert_company_created", ["company_id", "created_at"])},
    {"table": "undo_snapshots", "index": ("ix_undo_snapshots_company_id", ["company_id"])},
    {"table": "document_embedding", "index": ("ix_document_embedding_company_id", ["company_id"])},
    {
        "table": "background_tasks",
        "nullable": True,
        "index": ("ix_bg_tasks_company_created", ["company_id", "created_at"]),
    },
]


def _inspector(bind):
    return sa.inspect(bind)


def _columns(bind, table: str) -> set[str]:
    insp = _inspector(bind)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _index_names(bind, table: str) -> set[str]:
    return {ix["name"] for ix in _inspector(bind).get_indexes(table)}


def _unique_names(bind, table: str) -> set[str]:
    return {uq["name"] for uq in _inspector(bind).get_unique_constraints(table)}


def upgrade() -> None:
    bind = op.get_bind()

    for spec in _SPECS:
        table = spec["table"]
        existing = _columns(bind, table)
        if not existing:
            continue  # 0001_baseline 이 만들기 전의 아주 오래된 DB — 해당 테이블 없음

        nullable = spec.get("nullable", False)

        # ① 컬럼 추가 — server_default 가 기존 행을 1(sy)로 채우므로 별도 백필이 없다.
        #    (background_tasks 는 기본값 없이 NULL 로 두는 것이 맞다 — 전역 잡 표시)
        #    SQLite 는 ALTER 로 FK 를 못 더하고 강제(PRAGMA)도 꺼진 로컬 전용 방언이라
        #    FK 없이 컬럼만 더한다. 운영(Postgres)은 FK 포함.
        if "company_id" not in existing:
            default = None if nullable else "1"
            if bind.dialect.name == "sqlite":
                col = sa.Column(
                    "company_id", sa.Integer(), nullable=nullable, server_default=default
                )
            else:
                col = sa.Column(
                    "company_id",
                    sa.Integer(),
                    sa.ForeignKey("companies.id", ondelete="CASCADE"),
                    nullable=nullable,
                    server_default=default,
                )
            op.add_column(table, col)

        # ② 인덱스
        index = spec.get("index")
        if index and index[0] not in _index_names(bind, table):
            op.create_index(index[0], table, index[1])

        # ③ 유니크 제약 교체 — SQLite 는 테이블 재작성이 필요해 batch 로 처리한다.
        uq = spec.get("uq")
        if uq:
            old_name, new_name, new_cols = uq
            uniques = _unique_names(bind, table)
            if old_name in uniques or new_name not in uniques:
                with op.batch_alter_table(table) as batch:
                    if old_name in uniques:
                        batch.drop_constraint(old_name, type_="unique")
                    if new_name not in uniques:
                        batch.create_unique_constraint(new_name, new_cols)


def downgrade() -> None:
    bind = op.get_bind()

    for spec in reversed(_SPECS):
        table = spec["table"]
        if "company_id" not in _columns(bind, table):
            continue

        uq = spec.get("uq")
        if uq:
            old_name, new_name, _ = uq
            uniques = _unique_names(bind, table)
            with op.batch_alter_table(table) as batch:
                if new_name in uniques:
                    batch.drop_constraint(new_name, type_="unique")
                if old_name not in uniques:
                    # 기업 범위 해제 — 단일 테넌트로 되돌아간다
                    batch.create_unique_constraint(old_name, uq_old_columns(table))

        index = spec.get("index")
        if index and index[0] in _index_names(bind, table):
            op.drop_index(index[0], table_name=table)

        with op.batch_alter_table(table) as batch:
            batch.drop_column("company_id")


def uq_old_columns(table: str) -> list[str]:
    return {
        "marketing_period_meta": ["year", "month"],
        "keyword_watch": ["keyword", "device"],
    }[table]
