from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.settings import settings

# PostgreSQL 연결 URL: .env의 DATABASE_URL 사용 (Supabase 등)
# 형식: "postgresql+psycopg2://[유저명]:[비밀번호]@[호스트]:[포트]/[데이터베이스명]"
SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=settings.ENVIRONMENT != "production",  # 운영 환경에서는 SQL 로그 비활성화
    pool_pre_ping=True,  # 풀에서 꺼낸 커넥션이 Supabase 풀러에서 이미 끊겼으면 자동 재연결
    pool_recycle=1800,  # 30분마다 커넥션 재생성 (서버측 idle timeout 선제 대응)
    connect_args={
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass