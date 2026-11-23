"""순위 값을 사람이 읽는 문자로 바꾸는 규칙 — 메일 템플릿들이 공유한다.

알림 메일과 월간 리포트가 같은 값을 다르게 적으면(한쪽은 "노출 없음", 다른 쪽은 "0위")
같은 사실을 두 가지로 읽게 된다. 규칙을 한 곳에 둔다.
"""

from __future__ import annotations

_DEVICE_LABELS = {"all": "전체", "pc": "PC", "mobile": "모바일"}


def device_label(device: str) -> str:
    return _DEVICE_LABELS.get(device, device)


def rank_label(rank: float | None) -> str:
    """None 은 '노출 없음' — 0 으로 적으면 1위보다 좋은 순위처럼 읽힌다."""
    if rank is None:
        return "노출 없음"
    rounded = round(rank, 1)
    return f"{int(rounded)}위" if rounded == int(rounded) else f"{rounded}위"
