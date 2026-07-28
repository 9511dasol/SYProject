"""Alembic 실행 환경.

- DB URL은 .env(app.core.settings) 단일 출처에서 가져온다.
- target_metadata 에 모든 모델을 등록해 autogenerate 가 전체 스키마를 인식하게 한다.
- pgvector 의 Vector 컬럼도 렌더링되도록 임포트해 둔다.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app.core.database import Base
from app.core.settings import settings

# 모델 모듈을 모두 임포트해야 Base.metadata 에 테이블이 등록된다.
# (임포트만으로 매퍼가 Base 에 붙는다 — 사용하지 않아도 지우지 말 것)
from app.models import (  # noqa: F401
    ai_tool_usage_log_model,
    ai_usage_budget_model,
    background_task_model,
    embedding_model,
    heading_suggestion_model,
    marketing_model,
    report_log_model,
    system_setting_model,
    undo_snapshot_model,
    user_model,
)

config = context.config

# alembic.ini 의 로깅 설정 적용 (ini 없이 프로그램적으로 호출될 때는 건너뜀)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# .env 의 DATABASE_URL 을 최우선으로 사용한다.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

# 앱은 기동할 때마다 `alembic upgrade head` 를 실행한다. Cloud Run 처럼 인스턴스가
# 0개까지 줄었다가 트래픽이 몰려 여러 개가 동시에 콜드스타트하면, 같은 마이그레이션을
# 여러 프로세스가 동시에 실행하려 들어 교착하거나 한쪽이 실패해 기동이 깨질 수 있다.
#
# 트랜잭션 스코프 advisory lock 을 잡으면 두 번째 인스턴스는 경쟁하는 대신 기다렸다가,
# 자기 차례에 "이미 head" 임을 확인하고 no-op 으로 넘어간다.
# xact 스코프라 커밋/롤백 시 자동 해제되므로, 마이그레이션이 도중에 실패해도
# 락이 남아 다음 배포를 막는 일이 없다.
_MIGRATION_LOCK_KEY = 8_210_001


def _lock_migrations(connection) -> None:
    """마이그레이션 직렬화용 advisory lock (PostgreSQL 전용, 그 외 백엔드는 무시)."""
    if connection.dialect.name == "postgresql":
        connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _MIGRATION_LOCK_KEY})


def run_migrations_offline() -> None:
    """--sql 모드: 실제 접속 없이 SQL 만 생성."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """실제 DB에 접속해 마이그레이션 실행."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            # 락은 현재 리비전을 읽기 전에 잡아야 한다 — 그 뒤에 잡으면 두 인스턴스가
            # 모두 "아직 0003" 을 읽고 같은 업그레이드를 시도할 수 있다.
            _lock_migrations(connection)
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
