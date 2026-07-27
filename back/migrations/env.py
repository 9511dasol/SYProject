"""Alembic 실행 환경.

- DB URL은 .env(app.core.settings) 단일 출처에서 가져온다.
- target_metadata 에 모든 모델을 등록해 autogenerate 가 전체 스키마를 인식하게 한다.
- pgvector 의 Vector 컬럼도 렌더링되도록 임포트해 둔다.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.database import Base
from app.core.settings import settings

# 모델 모듈을 모두 임포트해야 Base.metadata 에 테이블이 등록된다.
# (임포트만으로 매퍼가 Base 에 붙는다 — 사용하지 않아도 지우지 말 것)
from app.models import (  # noqa: F401
    ai_tool_usage_log_model,
    ai_usage_budget_model,
    embedding_model,
    marketing_model,
    report_log_model,
    system_setting_model,
    user_model,
)

config = context.config

# alembic.ini 의 로깅 설정 적용 (ini 없이 프로그램적으로 호출될 때는 건너뜀)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# .env 의 DATABASE_URL 을 최우선으로 사용한다.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata


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
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
