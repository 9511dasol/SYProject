"""업로드된 마케팅 데이터의 연월별 관리 (관리자 전용).

지금까지 잘못 올린 데이터를 지우려면 DB를 직접 만지는 수밖에 없었다.
연월 단위로 무엇이 얼마나 쌓여 있는지 보고, 통째로 지울 수 있게 한다.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.core.security import get_db, require_admin
from app.models.user_model import User
from app.repositories.marketing_repo import MarketingRepository
from app.schemas.admin_period_schema import (
    PeriodDeleteResponse,
    PeriodOverviewItem,
    PeriodOverviewResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/periods", tags=["admin-periods"])


@router.get("", response_model=PeriodOverviewResponse)
def list_periods(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> PeriodOverviewResponse:
    items = MarketingRepository(db).list_period_overview()
    return PeriodOverviewResponse(
        items=[PeriodOverviewItem(**item) for item in items],
        total_rows=sum(item["row_count"] for item in items),
    )


@router.delete("/{year}/{month}", response_model=PeriodDeleteResponse)
def delete_period(
    year: int = Path(..., ge=2000, le=2999),
    month: int = Path(..., ge=1, le=12),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PeriodDeleteResponse:
    """해당 연월의 데이터 행·코멘트·엑셀 원본을 모두 삭제한다 (되돌릴 수 없음)."""
    repo = MarketingRepository(db)
    try:
        result = repo.delete_period(year, month)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("기간 삭제 실패: %d-%02d", year, month)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"삭제 실패: {exc}"
        ) from exc

    if not result["deleted_rows"] and not result["deleted_meta"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 기간에 삭제할 데이터가 없습니다."
        )

    logger.info(
        "관리자 %s 가 %d년 %d월 데이터 삭제 (행 %d건)",
        admin.email, year, month, result["deleted_rows"],
    )
    return PeriodDeleteResponse(
        year=year,
        month=month,
        message=f"{year}년 {month}월 데이터 {result['deleted_rows']}건을 삭제했습니다.",
        **result,
    )
