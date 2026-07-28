"""헬스체크 엔드포인트.

`/` 도 200을 돌려주지만 DB를 전혀 건드리지 않아서, DB 연결이 끊긴 상태에서도
"정상"으로 보인다. 배포 플랫폼의 헬스체크나 외부 모니터링이 실제 장애를 감지하려면
의존 서비스까지 확인하는 엔드포인트가 따로 필요하다.

인증을 걸지 않는다 — 헬스체크는 로그인 전에 호출돼야 하고, 노출되는 정보는
"살아 있는지" 뿐이다.
"""

import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/healthz")
def healthz(db: Session = Depends(get_db)) -> JSONResponse:
    """DB까지 확인하는 헬스체크. 실패 시 503."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("헬스체크 실패 — DB 연결 불가")
        return JSONResponse(
            {"status": "degraded", "database": "error"},
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return JSONResponse({"status": "ok", "database": "ok"})
