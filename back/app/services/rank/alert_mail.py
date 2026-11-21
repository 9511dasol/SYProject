"""순위 알림 메일 HTML 빌드.

ReportBuilderService 와 같은 구조 — Jinja 환경을 한 번 만들고 템플릿만 렌더한다.
숫자를 문자로 바꾸는 일은 템플릿이 아니라 여기서 한다(템플릿에 `{% if %}` 가
늘어나면 메일 서식이 어디서 결정되는지 알 수 없어진다).
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.services.rank.alert_engine import ALERT_DROP, AlertItem

_TEMPLATE_DIR = Path(__file__).parent.parent.parent / "templates"

_DEVICE_LABELS = {"all": "전체", "pc": "PC", "mobile": "모바일"}


def _device_label(device: str) -> str:
    return _DEVICE_LABELS.get(device, device)


def _rank_label(rank: float | None) -> str:
    """None 은 '노출 없음' — 0 으로 적으면 1위보다 좋은 순위처럼 읽힌다."""
    if rank is None:
        return "노출 없음"
    rounded = round(rank, 1)
    return f"{int(rounded)}위" if rounded == int(rounded) else f"{rounded}위"


class RankAlertMailBuilder:
    def __init__(self, template_dir: Path = _TEMPLATE_DIR):
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=True,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def build(self, items: list[AlertItem]) -> str:
        drops = [i for i in items if i.alert_type == ALERT_DROP]
        recoveries = [i for i in items if i.alert_type != ALERT_DROP]
        # 기준일은 항목마다 같을 것이나, 비어 있는 항목이 섞일 수 있어 있는 값 중 최신을 쓴다.
        stat_dates = sorted(i.stat_date for i in items if i.stat_date)

        template = self._env.get_template("email/rank_alert.html")
        return template.render(
            drops=drops,
            recoveries=recoveries,
            stat_date=stat_dates[-1] if stat_dates else "",
            device_label=_device_label,
            rank_label=_rank_label,
        )
