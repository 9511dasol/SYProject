from dataclasses import dataclass
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.services.analysis_service import PeriodComparison
from app.services.llm.base import AbstractLLMClient
from app.services.token_usage import TokenUsage

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


@dataclass(frozen=True)
class CommentResult:
    """코멘트 한 건의 결과.

    cached 를 따로 두는 이유는 사용량 기록 때문이다. 재사용한 코멘트는 토큰을 쓰지
    않았으므로 ai_tool_usage_logs 에 호출로 남기면 안 된다 — usage 가 None 인 것만으로는
    "재사용"과 "공급자가 사용량을 안 줌"을 구분할 수 없다.
    """

    text: str
    usage: TokenUsage | None
    cached: bool


class CommentService:
    def __init__(self, llm: AbstractLLMClient, template_dir: Path = _TEMPLATE_DIR):
        self._llm = llm
        self._env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def build_prompt(self, comparison: PeriodComparison) -> str:
        """AI 에 보낼 프롬프트. 호출부가 캐시 지문을 만드는 데도 쓴다."""
        return self._env.get_template("prompts/monthly_report.j2").render(c=comparison)

    def generate_with_usage(self, comparison: PeriodComparison) -> CommentResult:
        """LLM 을 호출해 코멘트를 받는다. 캐시 판단은 호출부가 한다."""
        text, usage = self._llm.generate_with_usage(self.build_prompt(comparison))
        return CommentResult(text=text, usage=usage, cached=False)

    def generate(self, comparison: PeriodComparison) -> str:
        return self.generate_with_usage(comparison).text
