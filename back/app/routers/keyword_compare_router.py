from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

<<<<<<< HEAD
from app.core.feature_flags import require_feature_flag
=======
from app.core.security import get_current_user
>>>>>>> 26c570e4693d28626af1db6ea0e676ff75e7b0b0
from app.services.keyword_compare_service import KeywordCompareService

router = APIRouter(
    prefix="/api/keyword-compare",
    tags=["Keyword Compare"],
<<<<<<< HEAD
    dependencies=[Depends(require_feature_flag("is_keyword_compare_enabled"))],
=======
    dependencies=[Depends(get_current_user)],
>>>>>>> 26c570e4693d28626af1db6ea0e676ff75e7b0b0
)


@router.post("/parse")
async def parse_keyword_compare(file: UploadFile = File(...)) -> dict:
    """키워드 비교 Excel 파일(.xlsx) 파싱 — 시트별 이번/이전 비교 데이터 반환"""
    content = await file.read()
    try:
        parsed = KeywordCompareService().parse_file(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"파일 파싱 중 오류가 발생했습니다: {exc}")

    sheets = parsed["sheets"]
    skipped = parsed["skipped"]

    if not sheets:
        detail = "분석 가능한 시트가 없습니다. 파일 형식을 확인해 주세요."
        if skipped:
            reasons = "; ".join(f"{s['name']}: {s['reason']}" for s in skipped)
            detail += f" (건너뛴 시트 — {reasons})"
        raise HTTPException(status_code=422, detail=detail)

    return {"sheets": sheets, "skipped_sheets": skipped}
