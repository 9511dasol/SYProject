from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.feature_flags import require_feature_flag
from app.services.keyword_compare_service import KeywordCompareService

router = APIRouter(
    prefix="/api/keyword-compare",
    tags=["Keyword Compare"],
    dependencies=[Depends(require_feature_flag("is_keyword_compare_enabled"))],
)


@router.post("/parse")
async def parse_keyword_compare(file: UploadFile = File(...)) -> dict:
    """키워드 비교 Excel 파일(.xlsx) 파싱 — 시트별 이번/이전 비교 데이터 반환"""
    content = await file.read()
    try:
        sheets = KeywordCompareService().parse_file(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"파일 파싱 중 오류가 발생했습니다: {exc}")

    if not sheets:
        raise HTTPException(status_code=422, detail="분석 가능한 시트가 없습니다. 파일 형식을 확인해 주세요.")

    return {"sheets": sheets}
