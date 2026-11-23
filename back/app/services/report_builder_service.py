from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.services.analysis_service import PeriodComparison
from app.services.rank.formatting import device_label, rank_label

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


class ReportBuilderService:
    def __init__(self, template_dir: Path = _TEMPLATE_DIR):
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=True,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def build(
        self,
        comparison: PeriodComparison,
        comment: str,
        rank_section=None,
    ) -> str:
        """rank_section 은 선택이다 — 순위 모니터링을 쓰지 않는 환경에서도
        리포트는 예전과 똑같이 나가야 하므로, 없으면 그 구역을 그리지 않는다."""
        template = self._env.get_template("email/report.html")
        return template.render(
            c=comparison,
            comment=comment,
            rank=rank_section,
            device_label=device_label,
            rank_label=rank_label,
        )
