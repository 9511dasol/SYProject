from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.services.analysis_service import PeriodComparison

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


class ReportBuilderService:
    def __init__(self, template_dir: Path = _TEMPLATE_DIR):
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=True,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def build(self, comparison: PeriodComparison, comment: str) -> str:
        template = self._env.get_template("email/report.html")
        return template.render(c=comparison, comment=comment)
