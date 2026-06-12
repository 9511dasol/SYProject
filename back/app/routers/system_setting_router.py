from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_db, require_admin
from app.models.user_model import User
from app.repositories.system_setting_repo import SystemSettingRepository
from app.schemas.system_setting_schema import FeatureFlagOut, FeatureFlagUpdate

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
    return [
        FeatureFlagOut(key=s.key, value=s.value == "true", description=s.description)
        for s in repo.list_all()
    ]


@router.patch("/api/admin/settings/{key}", response_model=FeatureFlagOut)
def update_setting(
    key: str,
    body: FeatureFlagUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    repo = SystemSettingRepository(db)
    try:
        setting = repo.set_value(key, body.value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FeatureFlagOut(key=setting.key, value=setting.value == "true", description=setting.description)
