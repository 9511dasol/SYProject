"""keyword_watch 에 API 자동 수집(M2)용 컬럼 추가

Revision ID: 0011_rank_api_collect
Revises: 0010_rank_alerts
Create Date: 2026-11-22

네이버 검색광고 API 로 순위를 직접 받아오려면 키워드 글자가 아니라 광고 키워드 ID가
필요하다. 그 ID는 계정 전체(광고그룹 수백 개)를 훑어야 얻을 수 있어 매번 다시 찾을 수
없으므로, 한 번 찾은 값을 감시 행에 저장해 둔다.

수집 실패 원인도 코드로 남긴다 — "오류"로 뭉뚱그리면 사용자가 스스로 해결할 수 없다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0011_rank_api_collect"
down_revision: Union[str, None] = "0010_rank_alerts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "keyword_watch"

# 모델과 같은 방언별 타입 — Postgres 는 JSONB, 그 외(SQLite)는 JSON.
_JSON = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")

_COLUMNS = (
    ("nv_keyword_ids", lambda: sa.Column("nv_keyword_ids", _JSON, nullable=True)),
    ("nv_synced_at", lambda: sa.Column("nv_synced_at", sa.DateTime(timezone=True), nullable=True)),
    ("last_error_code", lambda: sa.Column("last_error_code", sa.String(length=30), nullable=True)),
    ("last_error_at", lambda: sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True)),
)


def _column_names(bind, table: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    existing = _column_names(op.get_bind(), _TABLE)
    if not existing:
        return  # keyword_watch 자체가 없다 — 0009 가 만든다
    for name, make in _COLUMNS:
        if name not in existing:
            op.add_column(_TABLE, make())


def downgrade() -> None:
    existing = _column_names(op.get_bind(), _TABLE)
    for name, _ in reversed(_COLUMNS):
        if name in existing:
            op.drop_column(_TABLE, name)
