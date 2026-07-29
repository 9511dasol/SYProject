"""monthly_report.j2 렌더링 테스트 — LLM 호출 없이 프롬프트 문자열만 검증."""

from app.services.analysis_service import MediaComparison, MediaKPI, PeriodComparison
from app.services.comment_service import CommentService
from app.services.token_usage import TokenUsage


class _StubLLM:
    def __init__(self, usage: TokenUsage | None = None):
        self.prompt = ""
        self._usage = usage

    def generate_with_usage(self, prompt: str) -> tuple[str, TokenUsage | None]:
        self.prompt = prompt
        return "코멘트", self._usage


def _comparison(has_prev2: bool) -> PeriodComparison:
    media = MediaComparison(
        campaign_type="네이버SA",
        curr=MediaKPI("네이버SA", clicks=150, cost=150.0, conversions=15, revenue=1500.0),
        prev=MediaKPI("네이버SA", clicks=100, cost=100.0, conversions=10, revenue=1000.0),
        prev2=MediaKPI("네이버SA", clicks=200, cost=200.0, conversions=20, revenue=2000.0),
        cost_chg=50.0,
        conv_chg=50.0,
        revenue_chg=50.0,
        prev_cost_chg=-50.0,
        prev_conv_chg=-50.0,
        prev_revenue_chg=-50.0,
        cost_trend="반등",
        conv_trend="반등",
        revenue_trend="반등",
    )
    return PeriodComparison(
        curr_year=2026, curr_month=6,
        prev_year=2026, prev_month=5,
        prev2_year=2026, prev2_month=4,
        by_media=[media],
        curr_cost=150.0, prev_cost=100.0, prev2_cost=200.0,
        curr_conversions=15, prev_conversions=10, prev2_conversions=20,
        curr_revenue=1500.0, prev_revenue=1000.0, prev2_revenue=2000.0,
        cost_chg=50.0, conv_chg=50.0, revenue_chg=50.0,
        prev_cost_chg=-50.0, prev_conv_chg=-50.0, prev_revenue_chg=-50.0,
        cost_trend="반등", conv_trend="반등", revenue_trend="반등",
        has_prev2=has_prev2,
    )


def _render(has_prev2: bool) -> str:
    llm = _StubLLM()
    CommentService(llm=llm).generate(_comparison(has_prev2))
    return llm.prompt


class TestUsagePassthrough:
    """코멘트와 함께 토큰 사용량이 올라와야 관리자 화면·예산 집계에 잡힌다."""

    def test_usage_is_returned_alongside_the_comment(self):
        usage = TokenUsage(prompt_tokens=1200, output_tokens=300, total_tokens=1500)
        comment, got = CommentService(llm=_StubLLM(usage)).generate_with_usage(
            _comparison(has_prev2=True)
        )

        assert comment == "코멘트"
        assert got == usage

    def test_missing_usage_does_not_break_generation(self):
        comment, got = CommentService(llm=_StubLLM(None)).generate_with_usage(
            _comparison(has_prev2=True)
        )

        assert comment == "코멘트"
        assert got is None


class TestThreeMonthPrompt:
    def test_includes_all_three_months(self):
        prompt = _render(has_prev2=True)

        assert "최근 3개월" in prompt
        assert "2026년 4월" in prompt and "2026년 5월" in prompt and "2026년 6월" in prompt
        assert "직전 구간" in prompt

    def test_trend_label_and_guidance_present(self):
        prompt = _render(has_prev2=True)

        assert "반등" in prompt
        # 반등을 '성장'으로 단정하지 말라는 지침이 들어가야 한다
        assert "성장" in prompt and "단정" in prompt

    def test_media_row_shows_three_values(self):
        prompt = _render(has_prev2=True)
        assert "200원 → 100원 → 150원" in prompt


class TestTwoMonthFallback:
    def test_omits_three_month_block_when_prev2_missing(self):
        prompt = _render(has_prev2=False)

        assert "최근 3개월" not in prompt
        assert "직전 구간" not in prompt
        assert "당월 vs 전월" in prompt

    def test_still_renders_two_month_figures(self):
        prompt = _render(has_prev2=False)
        assert "100원 → 150원" in prompt
