from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.settings import settings

# PostgreSQL 연결 URL: .env의 DATABASE_URL 사용 (Supabase 등)
# 형식: "postgresql+psycopg2://[유저명]:[비밀번호]@[호스트]:[포트]/[데이터베이스명]"
SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=settings.ENVIRONMENT != "production",  # 운영 환경에서는 SQL 로그 비활성화
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass