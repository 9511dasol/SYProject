"""company_id 과도기 기본값(sy) 제거

Revision ID: 0015_drop_company_default
Revises: 0014_audit_budget
Create Date: 2026-11-25

0013/0014 가 테넌트 컬럼을 추가할 때 넣은 server_default='1'(sy) 은 **과도기 장치**였다.
그때는 아직 애플리케이션이 company_id 를 명시하지 않았으므로, 기본값이 없으면 기존
코드가 전부 NOT NULL 위반으로 깨졌다.

이제 3단계(테넌트 스코핑)로 모든 생성 경로가 소속 기업을 명시하므로 기본값을 뗀다.
떼는 이유가 핵심이다 — 기본값이 남아 있으면 **새로 추가된 코드가 company_id 를
빠뜨려도 조용히 sy 데이터로 섞여 들어간다**. 격리 위반이 가장 들키기 어려운 형태로
숨는 셈이다. 기본값을 없애면 그 실수가 INSERT 실패로 즉시 드러난다.

SQLite 는 ALTER COLUMN 이 없어 테이블 재작성이 필요한데, 로컬·테스트 DB 는 모델에서
바로 create_all 로 만들어지므로(이미 기본값 없음) 이 리비전은 Postgres 에서만 동작한다.

주의: 리비전 ID는 32자를 넘으면 안 된다 — alembic_version.version_num 이 VARCHAR(32) 다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0015_drop_company_default"
down_revision: Union[str, None] = "0014_audit_budget"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (테이블, 컬럼) — company_id 에 과도기 기본값이 걸린 전부.
_TABLES = (
    "users",
    "marketing_period_meta",
    "marketing_data",
    "ai_tool_usage_logs",
    "report_log",
    "heading_suggestions",
    "keyword_watch",
    "keyword_rank_snapshot",
    "rank_alert_log",
    "undo_snapshots",
    "document_embedding",
    "ai_usage_budget",
)


def _existing_tables(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite(로컬·테스트)는 모델 그대로 생성되므로 기본값이 애초에 없다.
        return

    tables = _existing_tables(bind)
    for table in _TABLES:
        if table in tables:
            op.execute(sa.text(f'ALTER TABLE {table} ALTER COLUMN company_id DROP DEFAULT'))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    tables = _existing_tables(bind)
    for table in _TABLES:
        if table in tables:
            op.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN company_id SET DEFAULT 1"))
