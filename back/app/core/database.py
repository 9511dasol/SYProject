from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# 1. PostgreSQL 연결 URL (사용자명, 비밀번호, 호스트, 포트, DB명 입력)
# 형식: "postgresql+psycopg2://[유저명]:[비밀번호]@[호스트]:[포트]/[데이터베이스명]"
SQLALCHEMY_DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/marketing_db"

# 2. engine 생성 (SQLite 전용이었던 connect_args 삭제)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=True  # 터미널에서 실행되는 SQL 쿼리문을 로그로 보고 싶다면 True (운영 시에는 False)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass