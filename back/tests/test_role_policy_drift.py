"""역할 어휘가 늘어날 때 권한 정책 재검토를 강제한다.

역할 목록은 `UserRole` 하나가 단일 출처지만, 그 **부분집합**이 목적별로 여러 곳에
따로 적혀 있다. 각각 다른 정책이라 중복이 아니라 의도된 분리다:

    security._OUTBOUND_ALLOWED_ROLES   메일 등 외부 발송이 가능한 역할
    user_admin_router._DEV_CREATABLE_ROLES    dev 가 만들 수 있는 역할
    user_admin_router._ADMIN_CREATABLE_ROLES  기업 admin 이 만들 수 있는 역할
    dev_schema.DevCreatableRole        위와 같은 제약의 스키마 쪽 표현

네 곳 모두 허용 목록(allowlist)이라, 새 역할은 **자동으로 차단**된다 — 조용히
권한을 얻는 일은 없다. 그래서 보안상 안전하지만, 반대로 **아무도 "이 새 역할은
메일을 보낼 수 있어야 하나?"를 묻지 않는다**는 공백이 생긴다.

이 테스트는 역할 목록을 한 곳에 못 박아, 역할을 추가하면 실패하게 만든다. 실패하면
아래 네 정책을 모두 훑고 이 목록을 갱신하는 것이 절차다.
"""

from typing import get_args

from app.core.security import _OUTBOUND_ALLOWED_ROLES
from app.routers.user_admin_router import _ADMIN_CREATABLE_ROLES, _DEV_CREATABLE_ROLES
from app.schemas.auth_schema import UserRole
from app.schemas.dev_schema import DevCreatableRole

#: 현재 존재하는 역할 전체. 역할을 추가하면 이 테스트가 실패하고, 그때 위 네 정책을
#: 모두 검토해야 한다 — 특히 "외부 발송을 허용할지"는 기본값이 차단이므로 명시적
#: 결정이 필요하다.
KNOWN_ROLES = {"dev", "admin", "member", "trial"}


def test_role_vocabulary_is_pinned():
    """역할을 추가·삭제하면 여기서 먼저 걸린다 (모듈 docstring의 절차를 따를 것)."""
    assert set(get_args(UserRole)) == KNOWN_ROLES


def test_every_policy_subset_uses_real_roles():
    """정책 목록에 오타나 사라진 역할이 들어 있으면 그 항목은 영원히 매칭되지 않는다."""
    for policy in (
        set(_OUTBOUND_ALLOWED_ROLES),
        set(_DEV_CREATABLE_ROLES),
        set(_ADMIN_CREATABLE_ROLES),
        set(get_args(DevCreatableRole)),
    ):
        assert policy <= KNOWN_ROLES


def test_outbound_policy_blocks_trial_and_allows_staff():
    """정책의 현재 내용을 명시해 둔다 — 조용히 넓어지는 것도 변경이다."""
    assert "trial" not in _OUTBOUND_ALLOWED_ROLES
    assert KNOWN_ROLES - set(_OUTBOUND_ALLOWED_ROLES) == {"trial"}


def test_no_policy_can_create_a_dev_account():
    """dev 승격은 API 가 아니라 운영 스크립트의 일이다 (promote_dev.py)."""
    assert "dev" not in _DEV_CREATABLE_ROLES
    assert "dev" not in _ADMIN_CREATABLE_ROLES
    assert "dev" not in get_args(DevCreatableRole)
