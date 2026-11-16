"""add created_at indexes on ai_tool_usage_logs / report_log

Revision ID: 0007_usage_log_indexes
Revises: 0006_seed_media_budgets
Create Date: 2026-11-16

월 예산 게이트(require_ai_budget)는 AI 호출마다 ai_tool_usage_logs 를
`created_at >= :since` 로 집계한다. 이 컬럼에 인덱스가 없어서, 로그가 쌓일수록
이미지 정제·헤딩 추천 등 모든 AI 기능이 함께 느려지는 구조였다.

report_log 도 목록 조회가 항상 created_at DESC 정렬이라 같이 걸어 둔다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_usage_log_indexes"
down_revision: Union[str, None] = "0006_seed_media_budgets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (인덱스명, 테이블, 컬럼) — 모델의 index=True 가 만드는 이름과 같아야 중복 생성되지 않는다
_INDEXES = [
    ("ix_ai_tool_usage_logs_created_at", "ai_tool_usage_logs", "created_at"),
    ("ix_report_log_created_at", "report_log", "created_at"),
]


def _existing(bind, table: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {ix["name"] for ix in inspector.get_indexes(table)}


def upgrade() -> None:
    # 0001_baseline 이 "현재 모델 전체"를 create_all 하므로 신규 DB에는 이미 있을 수 있다.
    bind = op.get_bind()
    for name, table, column in _INDEXES:
        if table in sa.inspect(bind).get_table_names() and name not in _existing(bind, table):
            op.create_index(name, table, [column])


def downgrade() -> None:
    bind = op.get_bind()
    for name, table, _ in _INDEXES:
        if name in _existing(bind, table):
            op.drop_index(name, table_name=table)
