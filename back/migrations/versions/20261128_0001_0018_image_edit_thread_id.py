"""이미지 편집 기록에 대화(스레드) 식별자 추가

Revision ID: 0018_image_edit_thread_id
Revises: 0017_image_edit_records
Create Date: 2026-11-28

지난 작업 화면이 DM 형으로 바뀌면서 "대화" 단위가 필요해졌다. 지금까지는 파일명으로
묶었는데, 이름이 같은 다른 이미지가 한 대화로 합쳐지고 결과를 이어 편집하면 같은
작업이 쪼개졌다. 화면이 작업 시작 때 만든 id 를 전송마다 함께 보내 묶는다.

기존 행은 NULL 로 둔다 — 그때의 전송들이 어느 작업에 속했는지는 복원할 수 없고,
파일명으로 채워 넣으면 "추측한 묶음"이 사실처럼 굳는다. 화면이 NULL 을 파일명
묶음으로 폴백한다.

IF NOT EXISTS 로 쓰는 이유 — 0001 baseline 이 `create_all` 로 "없는 테이블"을 현재
모델대로 만든다. 빈 DB 에서 처음부터 올리면 이 컬럼이 baseline 단계에서 이미 생긴다.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018_image_edit_thread_id"
down_revision: Union[str, None] = "0017_image_edit_records"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE image_edit_records ADD COLUMN IF NOT EXISTS thread_id VARCHAR(36)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_image_edit_records_thread_id "
        "ON image_edit_records (thread_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_image_edit_records_thread_id")
    op.execute("ALTER TABLE image_edit_records DROP COLUMN IF EXISTS thread_id")
