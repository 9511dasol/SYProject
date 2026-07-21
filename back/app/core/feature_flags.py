"""기능 플래그를 라우터 레벨에서 강제하는 FastAPI 의존성.

프론트엔드의 FeatureGate는 페이지 진입만 막을 뿐, 엔드포인트를 직접 호출하면
플래그를 꺼도 그대로 동작하는 구멍이 있었다. require_feature_flag를 라우터의
`dependencies=[...]`에 걸어 API 레벨에서도 동일하게 차단한다.

키가 system_settings 테이블에 아예 없는 경우는 "아직 등록되지 않은 플래그"로
보고 통과시킨다 — 프론트 useFeatureFlagStore.isEnabled의 기본 동작(키 없으면
활성으로 간주)과 동일한 fail-open 정책이다.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_db
from app.repositories.system_setting_repo import SystemSettingRepository


def require_feature_flag(key: str):
    """지정된 기능 플래그가 꺼져 있으면 503을 응답하는 의존성을 생성한다."""

    def _dependency(db: Session = Depends(get_db)) -> None:
        setting = SystemSettingRepository(db).get(key)
        if setting is not None and setting.value != "true":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="현재 점검 중인 기능입니다.",
            )

    return _dependency
