"""Alembic 마이그레이션 실행·점검 유틸.

앱 기동과 배포 파이프라인이 같은 Alembic 설정을 쓰도록 여기 한 곳에 모은다.

운영에서는 기동 시 자동 적용하지 않는다(RUN_MIGRATIONS_ON_STARTUP=false).
마이그레이션은 배포 파이프라인의 별도 단계(Cloud Run Job 등)에서
`python scripts/migrate.py upgrade` 로 먼저 적용한 뒤 새 리비전을 내보낸다.

기동 시 적용하면 마이그레이션 문제가 곧 "컨테이너가 포트를 못 엶"이 되어,
Cloud Run에는 원인이 드러나지 않는 전면 장애로 보인다. 실제로
DB에만 있고 코드에는 없는 리비전 때문에 서비스가 통째로 뜨지 못한 적이 있다.
"""

import logging
from pathlib import Path
from typing import Literal

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

from app.core.database import engine

logger = logging.getLogger(__name__)

_BACK_DIR = Path(__file__).resolve().parents[2]  # back/ (alembic.ini, migrations/ 위치)

# ok      — DB 리비전이 코드의 head 와 일치
# pending — 코드에 DB보다 최신 리비전이 있음 (upgrade 필요)
# unknown — DB 리비전이 코드의 migrations/versions/ 에 없음 (브랜치 간 DB 공유 사고)
# empty   — alembic_version 이 비어 있음 (한 번도 적용한 적 없는 DB)
SchemaState = Literal["ok", "pending", "unknown", "empty"]


def alembic_config() -> Config:
    """alembic.ini + 절대경로 script_location.

    script_location 을 절대경로로 덮어써야 작업 디렉터리와 무관하게 동작한다
    (Cloud Run 컨테이너, Job, 로컬 uvicorn 이 각각 다른 cwd 로 뜬다).
    """
    cfg = Config(str(_BACK_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACK_DIR / "migrations"))
    return cfg


def upgrade_to_head() -> None:
    """alembic upgrade head — 스키마를 코드 기준 최신으로 맞춘다."""
    command.upgrade(alembic_config(), "head")


def _db_revisions() -> set[str]:
    with engine.connect() as conn:
        return set(MigrationContext.configure(conn).get_current_heads())


def schema_state() -> tuple[SchemaState, str]:
    """DB 스키마가 코드와 맞는지 확인해 (상태, 사람이 읽을 설명)을 돌려준다.

    DB 접속 실패는 여기서 잡지 않는다 — 호출자가 기동 실패로 다룰지 결정한다.
    """
    script = ScriptDirectory.from_config(alembic_config())
    head = script.get_current_head()
    current = _db_revisions()

    if not current:
        return "empty", "DB에 적용된 마이그레이션이 없습니다 (alembic_version 비어 있음)."

    # 코드가 모르는 리비전이 DB에 찍혀 있으면 upgrade 자체가 불가능하다.
    # (다른 브랜치에서 같은 DB에 마이그레이션을 적용했을 때 발생)
    unknown = sorted(rev for rev in current if _missing_from_scripts(script, rev))
    if unknown:
        return "unknown", (
            f"DB 리비전 {', '.join(unknown)} 이(가) migrations/versions/ 에 없습니다. "
            "다른 브랜치에서 같은 DB에 마이그레이션을 적용했을 가능성이 큽니다 — "
            "해당 리비전 파일을 가져오거나 DB를 분리하세요."
        )

    if current == {head}:
        return "ok", f"스키마가 최신입니다 (리비전 {head})."

    return "pending", (
        f"적용되지 않은 마이그레이션이 있습니다 (DB {', '.join(sorted(current))} → 코드 {head}). "
        "배포 단계에서 `python scripts/migrate.py upgrade` 를 실행하세요."
    )


def _missing_from_scripts(script: ScriptDirectory, revision: str) -> bool:
    try:
        return script.get_revision(revision) is None
    except Exception:  # alembic 은 미해결 리비전에 여러 예외 타입을 쓴다
        return True
