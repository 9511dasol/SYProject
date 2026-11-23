"""기능 플래그 키가 한 곳에서만 정의되는지 — 두 목록이 갈리지 않게 묶는다.

키는 세 곳에서 쓰인다: 스키마(Literal) · 기동 시 기본값(main) · 라우터가 거는 가드.
Literal 을 OpenAPI 로 내보내 프런트 타입을 생성하므로, 여기가 어긋나면 화면은
있지도 않은 플래그를 알고 있거나 새 플래그를 모른 채 지나간다.
"""

from app.schemas.system_setting_schema import FEATURE_FLAG_KEYS


def test_startup_defaults_match_the_contract():
    from app.main import _DEFAULT_FEATURE_FLAGS

    assert set(_DEFAULT_FEATURE_FLAGS) == set(FEATURE_FLAG_KEYS), (
        "main._DEFAULT_FEATURE_FLAGS 와 system_setting_schema.FeatureFlagKey 가 다릅니다 — "
        "플래그를 추가·삭제할 때 두 곳을 함께 고쳐야 합니다."
    )


def test_every_flag_has_a_description():
    """설명은 관리자 화면에 그대로 보인다 — 비어 있으면 무엇을 끄는지 알 수 없다."""
    from app.main import _DEFAULT_FEATURE_FLAGS

    missing = [key for key, (_, desc) in _DEFAULT_FEATURE_FLAGS.items() if not desc.strip()]
    assert missing == [], f"설명이 비어 있는 플래그: {missing}"


def test_router_guards_use_declared_keys():
    """require_feature_flag 에 넘기는 키가 선언 목록 안에 있어야 한다.

    오타가 나면 그 가드는 '등록되지 않은 플래그'로 취급돼 영원히 통과한다
    (feature_flags.require_feature_flag 의 fail-open 정책).
    """
    import re
    from pathlib import Path

    routers = Path(__file__).resolve().parents[1] / "app" / "routers"
    used = {
        match
        for path in routers.glob("*.py")
        for match in re.findall(r'require_feature_flag\(\s*"([^"]+)"', path.read_text("utf-8"))
    }
    unknown = used - set(FEATURE_FLAG_KEYS)
    assert unknown == set(), f"선언되지 않은 플래그를 가드에 썼습니다: {sorted(unknown)}"
