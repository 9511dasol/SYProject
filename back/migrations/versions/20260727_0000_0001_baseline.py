"""baseline — 현재 스키마를 Alembic 관리 하에 편입

Revision ID: 0001_baseline
Revises:
Create Date: 2026-07-27

기존 운영 DB에는 이미 create_all 로 테이블이 존재하므로, 이 baseline 은
"처음부터 생성"이 아니라 "기존 스키마를 그대로 채택"하는 성격이다.
따라서 멱등하게 동작하도록 작성한다:

- CREATE EXTENSION IF NOT EXISTS vector  (pgvector — document_embedding 용)
- Base.metadata.create_all(checkfirst=True)  → 없는 테이블만 생성 (기존 테이블은 건너뜀)
- 예전 app.main._init_db 가 시작 시마다 수행하던 인라인 ALTER 를 그대로 이관
  (구버전 스키마로 만들어진 기존 DB의 누락 컬럼 보정용 안전망)

이 덕분에 신규 DB(전체 생성)와 기존 운영 DB(누락분만 보정) 모두에서
`alembic upgrade head` 가 안전하게 no-op 또는 보정으로 끝난다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.database import Base

# env.py 가 모델을 임포트하지만, 이 파일 단독 실행 시에도 metadata 가 채워지도록 재임포트
from app.models import (  # noqa: F401
    ai_tool_usage_log_model,
    ai_usage_budget_model,
    embedding_model,
    marketing_model,
    report_log_model,
    system_setting_model,
    user_model,
)

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # pgvector — embedding 컬럼(Vector)이 있는 테이블 생성 전에 필요
    bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    # 없는 테이블만 생성 (기존 테이블은 그대로 둠)
    Base.metadata.create_all(bind=bind, checkfirst=True)

    # 구버전 스키마로 만들어진 기존 DB 보정 (예전 _init_db 의 인라인 마이그레이션 이관)
    bind.execute(sa.text(
        "ALTER TABLE marketing_period_meta ADD COLUMN IF NOT EXISTS excel_path TEXT"
    ))
    bind.execute(sa.text(
        "ALTER TABLE marketing_period_meta DROP COLUMN IF EXISTS excel_content"
    ))
    bind.execute(sa.text(
        "ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS signup FLOAT DEFAULT 0.0"
    ))
    bind.execute(sa.text(
        "ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS purchase FLOAT DEFAULT 0.0"
    ))
    bind.execute(sa.text(
        "ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS apply FLOAT DEFAULT 0.0"
    ))


def downgrade() -> None:
    # baseline 되돌리기 — 전체 테이블 삭제 (extension 은 다른 객체가 의존할 수 있어 남겨둔다)
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
