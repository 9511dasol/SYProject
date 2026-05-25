from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.database import engine, Base
from app.models.marketing_model import MarketingData as _MD, MarketingPeriodMeta as _MPM  # noqa: F401
from app.routers import marketing_router
from app.services.excel_service import _template_bytes


def _init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE marketing_period_meta ADD COLUMN IF NOT EXISTS excel_content BYTEA"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS signup FLOAT DEFAULT 0.0"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS purchase FLOAT DEFAULT 0.0"))
        conn.execute(text("ALTER TABLE marketing_data ADD COLUMN IF NOT EXISTS apply FLOAT DEFAULT 0.0"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    _init_db()
    _template_bytes()  # 대용량 템플릿 선로드
    yield


app = FastAPI(title="Marketing AI Pipeline API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(marketing_router.router)


@app.get("/")
def read_root():
    return {"message": "FastAPI 서버가 정상적으로 실행 중입니다."}
