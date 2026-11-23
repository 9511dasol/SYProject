from typing import Literal, get_args

from pydantic import BaseModel

# 화면을 켜고 끄는 기능 플래그 키. **정의는 여기 한 곳**이며,
# main._DEFAULT_FEATURE_FLAGS 가 이 목록과 같은지는 테스트가 지킨다.
#
# Literal 로 둔 이유: 이 값이 OpenAPI 에 실려야 프런트의 FeatureFlagKey 를
# 손으로 적지 않는다. 예전에는 양쪽을 사람이 맞춰야 했고, 기능을 추가해도
# 화면 쪽 목록은 그대로인 채 지나갔다.
FeatureFlagKey = Literal[
    "is_dashboard_enabled",
    "is_report_email_enabled",
    "is_keyword_compare_enabled",
    "is_image_filter_enabled",
    "is_image_resize_enabled",
    "is_heading_suggest_enabled",
    "is_rank_monitor_enabled",
]

FEATURE_FLAG_KEYS: frozenset[str] = frozenset(get_args(FeatureFlagKey))


class FeatureFlagOut(BaseModel):
    key: FeatureFlagKey
    value: bool
    description: str


class FeatureFlagUpdate(BaseModel):
    value: bool
