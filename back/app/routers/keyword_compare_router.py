import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.feature_flags import require_feature_flag
from app.core.security import get_current_user
from app.core.uploads import EXCEL_EXTENSIONS, check_content_length, read_data_upload
from app.services.keyword_compare_service import KeywordCompareService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/keyword-compare",
    tags=["Keyword Compare"],
    dependencies=[
        Depends(require_feature_flag("is_keyword_compare_enabled")),
        Depends(get_current_user),
    ],
)


@router.post("/parse")
async def parse_keyword_compare(request: Request, file: UploadFile = File(...)) -> dict:
    """키워드 비교 Excel 파일(.xlsx) 파싱 — 시트별 이번/이전 비교 데이터 반환"""
    check_content_length(request)
    content = await read_data_upload(file, allowed_extensions=EXCEL_EXTENSIONS)
    try:
        parsed = KeywordCompareService().parse_file(content)
    except Exception as exc:
        # pandas/openpyxl 내부 예외 문자열을 그대로 내보내지 않는다 — 사용자에게는
        # 의미 없고 내부 구현의 단서가 된다. 원인은 서버 로그에만 남긴다.
        logger.exception("키워드 비교 파일 파싱 실패 (filename=%s)", file.filename)
        raise HTTPException(
            status_code=422,
            detail="파일을 해석하지 못했습니다. 키워드 비교용 Excel(.xlsx) 양식인지 확인해 주세요.",
        ) from exc

    sheets = parsed["sheets"]
    skipped = parsed["skipped"]

    if not sheets:
        detail = "분석 가능한 시트가 없습니다. 파일 형식을 확인해 주세요."
        if skipped:
            reasons = "; ".join(f"{s['name']}: {s['reason']}" for s in skipped)
            detail += f" (건너뛴 시트 — {reasons})"
        raise HTTPException(status_code=422, detail=detail)

    return {"sheets": sheets, "skipped_sheets": skipped}
