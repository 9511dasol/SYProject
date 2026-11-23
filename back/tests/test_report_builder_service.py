"""report_builder_service 렌더링 테스트 (실제 Jinja 템플릿 사용, 외부 의존 없음)."""

from datetime import date

from app.services.analysis_service import MediaComparison, MediaKPI, PeriodComparison
from app.services.rank.report_section import RankReportRow, RankReportSection
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


# ── 키워드 순위 현황 구역 (M6) ────────────────────────────────────────────────


def test_rank_section_is_omitted_when_not_provided():
    """순위 모니터링을 쓰지 않는 환경에서도 리포트는 예전과 똑같이 나가야 한다."""
    html = ReportBuilderService().build(_sample_comparison(), comment="코멘트")
    assert "키워드 순위 현황" not in html


def test_rank_section_renders_rows_with_bid():
    section = RankReportSection(
        rows=[RankReportRow(
            keyword="마케팅자동화", device="pc", target_rank=3.0, current_rank=8.5,
            stat_date=date(2026, 11, 21), breach_streak=2,
            target_bid_pc=1700, target_bid_mobile=2200,
        )],
        total_watched=5, breached_total=1,
    )
    html = ReportBuilderService().build(
        _sample_comparison(), comment="코멘트", rank_section=section
    )

    assert "키워드 순위 현황" in html
    assert "마케팅자동화" in html
    assert "8.5위" in html and "3위" in html     # 현재 / 목표
    assert "1,700원" in html and "2,200원" in html
    assert "PC" in html


def test_rank_section_reports_omitted_rows():
    """상한에 걸려 못 실은 건수를 밝힌다 — 조용히 자르면 다 본 줄 안다."""
    section = RankReportSection(
        rows=[RankReportRow(
            keyword="하락키워드", device="all", target_rank=2.0, current_rank=9.0,
            stat_date=date(2026, 11, 21), breach_streak=3,
        )],
        total_watched=20, breached_total=12, omitted=4,
    )
    html = ReportBuilderService().build(
        _sample_comparison(), comment="코멘트", rank_section=section
    )
    assert "외 4개" in html


def test_rank_section_says_so_when_all_healthy():
    section = RankReportSection(rows=[], total_watched=5, breached_total=0)
    html = ReportBuilderService().build(
        _sample_comparison(), comment="코멘트", rank_section=section
    )
    assert "모두 목표 순위를 지키고" in html


def test_rank_section_renders_missing_bid_without_breaking():
    section = RankReportSection(
        rows=[RankReportRow(
            keyword="입찰가없음", device="all", target_rank=2.0, current_rank=None,
            stat_date=None, breach_streak=1,
        )],
        total_watched=1, breached_total=1,
    )
    html = ReportBuilderService().build(
        _sample_comparison(), comment="코멘트", rank_section=section
    )
    assert "입찰가없음" in html
    assert "노출 없음" in html                    # 0위로 적으면 안 된다
