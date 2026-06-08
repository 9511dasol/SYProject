from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.services.analysis_service import PeriodComparison
from app.services.llm.base import AbstractLLMClient

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


class CommentService:
    def __init__(self, llm: AbstractLLMClient, template_dir: Path = _TEMPLATE_DIR):
        self._llm = llm
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def generate(self, comparison: PeriodComparison) -> str:
        template = self._env.get_template("prompts/monthly_report.j2")
        prompt = template.render(c=comparison)
        return self._llm.generate(prompt)
