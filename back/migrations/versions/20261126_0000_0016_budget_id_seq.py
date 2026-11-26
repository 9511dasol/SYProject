"""ai_usage_budget.id 에 자동증가 시퀀스 부여

Revision ID: 0016_budget_id_seq
Revises: 0015_drop_company_default
Create Date: 2026-11-26

운영 DB 의 ai_usage_budget.id 에만 시퀀스(nextval 기본값)가 없었다. 정수 PK 15개를
전수 조사했더니 이 컬럼 하나만 column_default 도 identity 도 없는 상태였다.

왜 이렇게 됐나 — 이 테이블은 alembic 도입(0001_baseline) 이전에 만들어졌고, baseline 은
`create_all(checkfirst=True)` 로 "없는 테이블만" 만들었기 때문에 기존 테이블을 건드리지
않고 지나갔다. 그래서 **새로 만든 DB 에서는 모델대로 SERIAL 이 붙지만, 운영 DB 만
옛 모양으로 남는** 드리프트가 생겼다. 테스트가 전부 통과하는데 운영만 터진 이유다.

증상: company 를 새로 만들 때 예산 행 INSERT 가
`null value in column "id" ... violates not-null constraint` 로 실패한다.
체험 발급(create_trial)이 기업·계정·예산·샘플을 한 트랜잭션에 넣으므로 발급 자체가
통째로 실패했다. 체험뿐 아니라 **실기업 온보딩도 같은 지점에서 막힌다.**

시퀀스 시작값은 기존 최대 id 다음으로 맞춘다(기존 싱글턴 행 id=1 이 있다).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0016_budget_id_seq"
down_revision: Union[str, None] = "0015_drop_company_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "ai_usage_budget"
_SEQ = "ai_usage_budget_id_seq"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite(로컬·테스트)는 모델 그대로 생성돼 이미 자동증가다.
        return
    if _TABLE not in set(sa.inspect(bind).get_table_names()):
        return

    # OWNED BY 를 걸어 두면 컬럼·테이블이 지워질 때 시퀀스도 같이 정리된다.
    bind.execute(sa.text(f"CREATE SEQUENCE IF NOT EXISTS {_SEQ} OWNED BY {_TABLE}.id"))
    # 다음 값이 max(id)+1 이 되게 한다. is_called=false 라 setval 값이 '다음에 나올 값'이다.
    bind.execute(
        sa.text(
            f"SELECT setval('{_SEQ}', COALESCE((SELECT MAX(id) FROM {_TABLE}), 0) + 1, false)"
        )
    )
    bind.execute(sa.text(f"ALTER TABLE {_TABLE} ALTER COLUMN id SET DEFAULT nextval('{_SEQ}')"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    if _TABLE not in set(sa.inspect(bind).get_table_names()):
        return

    bind.execute(sa.text(f"ALTER TABLE {_TABLE} ALTER COLUMN id DROP DEFAULT"))
    bind.execute(sa.text(f"DROP SEQUENCE IF EXISTS {_SEQ}"))
