import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_db, require_admin
from app.models.user_model import User
from app.repositories.system_setting_repo import SystemSettingRepository
from app.schemas.system_setting_schema import (
    FEATURE_FLAG_KEYS,
    FeatureFlagOut,
    FeatureFlagUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["settings"])


# ── 공개: 프론트엔드 앱 시작 시 호출하여 기능 플래그를 캐싱 ─────────────────────

@router.get("/api/settings/flags")
def get_flags(db: Session = Depends(get_db)) -> dict[str, bool]:
    repo = SystemSettingRepository(db)
    return {setting.key: setting.value == "true" for setting in repo.list_all()}


# ── 관리자: 기능 플래그 조회 / 토글 ───────────────────────────────────────────

@router.get("/api/admin/settings", response_model=list[FeatureFlagOut])
def list_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    repo = SystemSettingRepository(db)
    known, unknown = [], []
    for s in repo.list_all():
        # 코드가 모르는 키(기능을 지웠는데 행이 남은 경우)는 건너뛴다. 그대로 내보내면
        # 응답 검증에서 터져 설정 화면 전체가 열리지 않는다 — 한 줄 때문에 전부 막힐 일이다.
        if s.key in FEATURE_FLAG_KEYS:
            known.append(
                FeatureFlagOut(key=s.key, value=s.value == "true", description=s.description)
            )
        else:
            unknown.append(s.key)
    if unknown:
        logger.warning("코드에 없는 기능 플래그를 건너뜀: %s", ", ".join(sorted(unknown)))
    return known


@router.patch("/api/admin/settings/{key}", response_model=FeatureFlagOut)
def update_setting(
    key: str,
    body: FeatureFlagUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if key not in FEATURE_FLAG_KEYS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"알 수 없는 기능 플래그입니다: {key}"
        )
    repo = SystemSettingRepository(db)
    try:
        setting = repo.set_value(key, body.value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FeatureFlagOut(key=setting.key, value=setting.value == "true", description=setting.description)
