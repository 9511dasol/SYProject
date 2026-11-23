from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.settings import settings

# 운영은 Postgres(JSONB), 테스트·로컬 검증은 SQLite — JSONB 는 SQLite 에서 렌더되지 않는다.
# 예전에는 모델마다 같은 두 줄을 복사했는데, 새 모델 세 곳이 이를 빠뜨려 SQLite 부팅이
# 깨진 적이 있다(2026-11-18 로컬 검증에서 발견). 정의를 여기 한 곳에 두고 가져다 쓴다.
PORTABLE_JSON = JSONB().with_variant(JSON(), "sqlite")

# PostgreSQL 연결 URL: .env의 DATABASE_URL 사용 (Supabase 등)
# 형식: "postgresql+psycopg2://[유저명]:[비밀번호]@[호스트]:[포트]/[데이터베이스명]"
SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# keepalive 계열은 psycopg2 전용 인자라 sqlite 드라이버가 거부한다.
# DATABASE_URL=sqlite:/// 로 띄우는 로컬 검증(원격 DB가 잠든 상태) 경로를 막지 않도록
# 방언에 맞는 인자만 넘긴다 — 운영(Postgres) 경로는 그대로다.
_is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")
_connect_args = (
    {"check_same_thread": False}  # 스레드풀 엔드포인트가 세션을 다른 스레드에서 쓴다
    if _is_sqlite
    else {
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=settings.ENVIRONMENT != "production",  # 운영 환경에서는 SQL 로그 비활성화
    pool_pre_ping=True,  # 풀에서 꺼낸 커넥션이 Supabase 풀러에서 이미 끊겼으면 자동 재연결
    pool_recycle=1800,  # 30분마다 커넥션 재생성 (서버측 idle timeout 선제 대응)
    # 기본값(5+10)은 블로킹 엔드포인트가 이벤트 루프에서 직렬 실행되던 시절 기준이다.
    # 지금은 스레드풀에서 병렬로 돌아 동시 커넥션 요구가 훨씬 커졌다.
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass