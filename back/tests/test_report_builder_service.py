"""report_builder_service 렌더링 테스트 (실제 Jinja 템플릿 사용, 외부 의존 없음)."""

from app.services.analysis_service import MediaComparison, MediaKPI, PeriodComparison
from app.services.report_builder_service import ReportBuilderService


def _sample_comparison() -> PeriodComparison:
    return PeriodComparison(
        curr_year=2026,
        curr_month=6,
        prev_year=2026,
        prev_month=5,
        by_media=[
            MediaComparison(
                campaign_type="네이버SA",
                curr=MediaKPI("네이버SA", cost=200.0, conversions=20, revenue=2000.0),
                prev=MediaKPI("네이버SA", cost=100.0, conversions=10, revenue=1000.0),
                cost_chg=100.0,
                conv_chg=100.0,
                revenue_chg=100.0,
            )
        ],
        curr_cost=200.0,
        prev_cost=100.0,
        curr_conversions=20,
        prev_conversions=10,
        curr_revenue=2000.0,
        prev_revenue=1000.0,
        cost_chg=100.0,
        conv_chg=100.0,
        revenue_chg=100.0,
    )


def test_build_renders_comment_and_returns_html():
    html = ReportBuilderService().build(_sample_comparison(), comment="이번 달 성과 코멘트")
    assert "이번 달 성과 코멘트" in html
    assert html.strip().lower().startswith("<!doctype") or "<html" in html.lower()


def test_build_escapes_html_in_comment():
    # autoescape=True 이므로 코멘트 내 태그는 이스케이프되어야 한다 (XSS 방지)
    html = ReportBuilderService().build(_sample_comparison(), comment="<script>alert(1)</script>")
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
