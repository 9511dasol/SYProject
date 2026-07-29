from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.services.analysis_service import PeriodComparison
from app.services.llm.base import AbstractLLMClient
from app.services.token_usage import TokenUsage

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

    def generate_with_usage(
        self, comparison: PeriodComparison
    ) -> tuple[str, TokenUsage | None]:
        """(코멘트, 토큰 사용량). 사용량은 ai_tool_usage_logs 기록·예산 집계에 쓴다."""
        template = self._env.get_template("prompts/monthly_report.j2")
        prompt = template.render(c=comparison)
        return self._llm.generate_with_usage(prompt)

    def generate(self, comparison: PeriodComparison) -> str:
        return self.generate_with_usage(comparison)[0]
