"""VectorDB(pgvector) 초기화 스크립트.

- pgvector 확장 활성화
- document_embedding 테이블 생성
- marketing_period_meta의 코멘트를 임베딩하여 적재

실행: uv run init_vectordb.py
"""

import logging

from openai import OpenAI
from sqlalchemy import text

from app.core.database import Base, SessionLocal, engine
from app.core.settings import settings
from app.models.embedding_model import DocumentEmbedding
from app.models.marketing_model import MarketingPeriodMeta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    logger.info("pgvector 확장 및 테이블 준비 완료")


def embed_marketing_period_comments() -> None:
    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY가 설정되지 않아 임베딩 적재를 건너뜁니다.")
        return

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    db = SessionLocal()
    try:
        metas = (
            db.query(MarketingPeriodMeta)
            .filter(MarketingPeriodMeta.comment != "")
            .all()
        )
        for meta in metas:
            exists = (
                db.query(DocumentEmbedding)
                .filter(
                    DocumentEmbedding.source_type == "marketing_period_meta",
                    DocumentEmbedding.source_id == meta.id,
                )
                .first()
            )
            if exists:
                continue

            response = client.embeddings.create(
                model=settings.OPENAI_EMBEDDING_MODEL,
                input=meta.comment,
            )
            db.add(
                DocumentEmbedding(
                    source_type="marketing_period_meta",
                    source_id=meta.id,
                    content=meta.comment,
                    embedding=response.data[0].embedding,
                )
            )
            logger.info("임베딩 추가: %s년 %s월", meta.year, meta.month)

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    init_schema()
    embed_marketing_period_comments()
    logger.info("VectorDB 초기화 완료")
