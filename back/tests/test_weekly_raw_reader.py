"""주간 리포트(RAW 탭) 리더 테스트.

실제 파일에서 확인한 두 가지 함정을 회귀로 묶어 둔다.

  1. 전환·매출만 담긴 행(노출·클릭·광고비가 0)을 버리면 매출의 98.8% 가 사라진다.
  2. `광고비(vat+)` 와 `광고비(vat,markup)` 가 나란히 있어 헤더를 정확히 가려야 한다.
"""

import datetime as dt

import pytest

from app.services.weekly_raw_reader_service import (
    DA_FALLBACK_LABEL,
    WeeklyRawReaderService,
    label_for,
    parse_period_label,
)
from tests.conftest import WEEKLY_RAW_HEADERS, weekly_raw_row

D = dt.date


@pytest.fixture
def svc():
    return WeeklyRawReaderService()


def _rows_for(content, svc, period=None):
    """단일 기간 리포트 → DB DataFrame."""
    reports = svc.read_reports(content, periods=[period] if period else None)
    return svc.to_db_dataframe(reports[0]) if len(reports) == 1 else None


# ── 매체 레이블 매핑 ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize(("ad_type", "platform", "expected"), [
    ("SA", "naver_sa", "네이버SA"),
    ("SA", "kakao_sa", "카카오SA"),
    ("SA", "google_sa", "구글SA"),
    ("BS", "naverbs_pc", "네이버BS"),
    ("BS", "naverbs_mo", "네이버BS"),          # PC/MO 가 한 레이블로 합쳐진다
    ("PSA", "naver_power(pc)", "네이버PSA"),
    ("PSA", "naver_power(mo)", "네이버PSA"),
    ("DA", "google_p-max", "구글DA"),
    ("DA", "google_youtube", "구글DA"),
    ("DA", "kakao_bizboard", "카카오DA"),
])
def test_label_for_known_platforms(ad_type, platform, expected):
    assert label_for(ad_type, platform) == expected


def test_label_for_unknown_da_platform_falls_back():
    """DA 플랫폼은 17종이고 계속 늘어난다 — 모르는 것도 버리지 않고 기타DA 로 모은다."""
    assert label_for("DA", "criteo") == DA_FALLBACK_LABEL
    assert label_for("DA", "아직_없는_매체") == DA_FALLBACK_LABEL


def test_label_for_unknown_search_platform_is_kept_not_dropped():
    """SA 에 새 플랫폼이 붙어도 행을 버리면 합계가 조용히 틀어진다."""
    assert label_for("SA", "bing_sa") == "기타SA"


@pytest.mark.parametrize(("label", "expected"), [
    ("26년 11월", (2026, 11)),
    ("26년 1월", (2026, 1)),
    ("2026년 11월", (2026, 11)),
    ("일부터 아닌 문자열", None),
])
def test_parse_period_label(label, expected):
    assert parse_period_label(label) == expected


# ── 집계 ────────────────────────────────────────────────────────────────────────

def test_rows_are_aggregated_per_date_and_label(make_weekly_raw_xlsx, svc):
    """원본 한 행은 (날짜·캠페인·그룹·기기) 단위 — DB 는 (날짜, 매체) 한 행이다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=100, clicks=10, cost=1000),
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=200, clicks=20, cost=2000),
        weekly_raw_row(D(2026, 8, 1), "naverbs_pc", "BS", impressions=5, clicks=1, cost=50),
        weekly_raw_row(D(2026, 8, 2), "naver_sa", "SA", impressions=7, clicks=2, cost=70),
    ])
    df = _rows_for(content, svc, "26년 8월")

    assert len(df) == 3
    sa_day1 = df[(df.campaign_type == "네이버SA") & (df.report_date == D(2026, 8, 1))].iloc[0]
    assert sa_day1.impressions == 300
    assert sa_day1.clicks == 30
    assert sa_day1.cost == 3000


def test_conversion_only_rows_are_kept(make_weekly_raw_xlsx, svc):
    """노출·클릭·광고비가 0 이고 전환·매출만 있는 행 — 실제 파일 매출의 98.8% 가 이 모양.

    월간 템플릿 리더의 `imp==0 and clk==0` 빈 행 규칙을 여기에 그대로 쓰면 안 된다는
    것을 못 박는 테스트다.
    """
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 7), "naverbs_pc", "BS", impressions=0, clicks=0, cost=0,
                       conversions=7, signup=1, purchase=6, revenue=511_100),
    ])
    df = _rows_for(content, svc, "26년 8월")

    assert len(df) == 1
    row = df.iloc[0]
    assert row.impressions == 0 and row.clicks == 0 and row.cost == 0
    assert row.conversions == 7
    assert row.conversion_revenue == 511_100
    assert row.purchase == 6


def test_all_zero_rows_are_dropped(make_weekly_raw_xlsx, svc):
    """지표가 전부 0 인 조합은 버린다 — 원본의 4.9% 가 0 패딩 행이다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=10, clicks=1, cost=100),
        weekly_raw_row(D(2026, 8, 2), "naver_sa", "SA"),  # 전부 0
    ])
    df = _rows_for(content, svc, "26년 8월")

    assert len(df) == 1
    assert df.iloc[0].report_date == D(2026, 8, 1)


def test_zero_sum_group_is_dropped_even_when_rows_exist(make_weekly_raw_xlsx, svc):
    """같은 (날짜,매체)에 0 행만 여러 개 있어도 결과에 남지 않는다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=10, clicks=1, cost=100),
        weekly_raw_row(D(2026, 8, 1), "kakao_sa", "SA"),
        weekly_raw_row(D(2026, 8, 1), "kakao_sa", "SA"),
    ])
    df = _rows_for(content, svc, "26년 8월")

    assert set(df.campaign_type) == {"네이버SA"}


# ── 컬럼 매핑 ───────────────────────────────────────────────────────────────────

def test_cost_uses_vat_column_not_markup(make_weekly_raw_xlsx, svc):
    """markup 광고비는 대행 수수료가 붙은 금액이라 DB 기준(vat+)과 다르다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA",
                       impressions=1, clicks=1, cost=1_000, markup_cost=1_100),
    ])
    df = _rows_for(content, svc, "26년 8월")
    assert df.iloc[0].cost == 1_000


def test_columns_are_found_by_header_not_position(make_weekly_raw_xlsx, svc):
    """대행사가 컬럼 순서를 바꿔도 헤더 이름으로 찾으므로 값이 밀리지 않는다."""
    # 노출/클릭 헤더와 값의 위치를 서로 맞바꾼다
    headers = list(WEEKLY_RAW_HEADERS)
    i_imp, i_clk = headers.index("노출"), headers.index("클릭")
    headers[i_imp], headers[i_clk] = headers[i_clk], headers[i_imp]

    row = weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=999, clicks=7, cost=10)
    content = make_weekly_raw_xlsx([row], headers=headers)

    df = _rows_for(content, svc, "26년 8월")
    # 헤더가 바뀐 대로 읽혀야 한다 — '노출' 헤더가 가리키는 칸의 값은 7 이다
    assert df.iloc[0].impressions == 7
    assert df.iloc[0].clicks == 999


def test_fractional_conversions_are_rounded_not_truncated(make_weekly_raw_xlsx, svc):
    """구글은 전환수를 소수로 준다. conversions 는 int 컬럼이라 반올림해 담는다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "google_sa", "SA",
                       impressions=10, clicks=5, cost=100,
                       conversions=28.48, signup=5.03, purchase=23.45),
    ])
    df = _rows_for(content, svc, "26년 8월")
    row = df.iloc[0]
    assert row.conversions == 28
    # 세부 전환은 float 컬럼이라 소수를 지킨다
    assert row.signup == pytest.approx(5.03)
    assert row.purchase == pytest.approx(23.45)


def test_missing_required_column_raises(make_weekly_raw_xlsx, svc):
    headers = [h for h in WEEKLY_RAW_HEADERS if h != "광고비(vat+)"]
    content = make_weekly_raw_xlsx(
        [weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1)], headers=headers
    )
    with pytest.raises(ValueError, match="광고비"):
        svc.read_reports(content)


# ── 기간 ────────────────────────────────────────────────────────────────────────

def test_list_period_summaries_counts_distinct_days(make_weekly_raw_xlsx, svc):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 7, 31), "naver_sa", "SA", impressions=1, clicks=1),
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1, clicks=1),
        weekly_raw_row(D(2026, 8, 1), "kakao_sa", "SA", impressions=1, clicks=1),
        weekly_raw_row(D(2026, 8, 2), "naver_sa", "SA", impressions=1, clicks=1),
    ])
    summaries = svc.list_period_summaries(content)

    assert [s["period"] for s in summaries] == ["26년 7월", "26년 8월"]
    assert [s["days"] for s in summaries] == [1, 2]  # 같은 날 매체 2개는 1일로 센다


def test_unknown_period_raises(make_weekly_raw_xlsx, svc):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1, clicks=1),
    ])
    with pytest.raises(ValueError, match="찾을 수 없습니다"):
        svc.read_reports(content, periods=["26년 3월"])


def test_period_filter_reads_only_that_month(make_weekly_raw_xlsx, svc):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 7, 31), "naver_sa", "SA", impressions=5, clicks=1),
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=9, clicks=1),
    ])
    reports = svc.read_reports(content, periods=["26년 8월"])

    assert [r["period"] for r in reports] == ["26년 8월"]
    df = svc.to_db_dataframe(reports[0])
    assert list(df.report_date) == [D(2026, 8, 1)]


# ── 리포트 구조 ─────────────────────────────────────────────────────────────────

def test_report_matches_response_contract(make_weekly_raw_xlsx, svc):
    """/load-excel 의 response_model 과 모양이 맞아야 한다."""
    from app.schemas.excel_report_schema import ExcelReport

    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA",
                       impressions=100, clicks=10, cost=1_000,
                       conversions=2, signup=1, purchase=1, revenue=50_000, apply=0),
        weekly_raw_row(D(2026, 8, 1), "google_p-max", "DA",
                       impressions=50, clicks=5, cost=500, conversions=1),
    ])
    report = svc.read_reports(content)[0]

    parsed = ExcelReport.model_validate(report)
    assert parsed.period == "26년 8월"
    assert set(parsed.media) == {"네이버SA", "구글DA"}
    # 이 양식에는 매체별 예산 표가 없다
    assert parsed.budget_table == []
    assert parsed.period_info.elapsed_days == 1
    assert parsed.period_info.total_days == 31


def test_daily_total_sums_across_media(make_weekly_raw_xlsx, svc):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=100, clicks=10, cost=1_000),
        weekly_raw_row(D(2026, 8, 1), "google_p-max", "DA", impressions=50, clicks=5, cost=500),
    ])
    report = svc.read_reports(content)[0]

    assert len(report["daily_total"]) == 1
    day = report["daily_total"][0]
    assert day["impressions"] == 150
    assert day["clicks"] == 15
    assert day["cost"] == 1_500
    assert day["ctr"] == pytest.approx(15 / 150)


def test_media_sheet_roundtrips_through_to_db_dataframe(make_weekly_raw_xlsx, svc):
    """media.daily 는 위치 기반 리스트다 — 쓰는 쪽과 읽는 쪽 규약이 어긋나면 값이 밀린다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 3), "naver_sa", "SA",
                       impressions=11, clicks=22, cost=33,
                       conversions=4, signup=5, purchase=6, revenue=77, apply=8),
    ])
    report = svc.read_reports(content)[0]
    df = svc.to_db_dataframe(report)
    row = df.iloc[0]

    assert row["report_date"] == D(2026, 8, 3)
    assert (row["impressions"], row["clicks"], row["cost"]) == (11, 22, 33)
    assert row["conversions"] == 4
    # `apply` 는 대괄호로 읽는다 — row.apply 는 Series.apply 메서드를 가리킨다
    assert (row["signup"], row["purchase"], row["conversion_revenue"], row["apply"]) == (5, 6, 77, 8)


def test_sa_total_computes_month_over_month(make_weekly_raw_xlsx, svc):
    """한 파일에 전 기간이 있으니 전월·전년 비교를 직접 계산한다."""
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2025, 8, 1), "naver_sa", "SA", impressions=50, clicks=5, cost=500),
        weekly_raw_row(D(2026, 7, 1), "naver_sa", "SA", impressions=100, clicks=10, cost=1_000),
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=200, clicks=20, cost=2_000),
    ])
    report = next(r for r in svc.read_reports(content) if r["period"] == "26년 8월")
    rows = {r["label"]: r for r in report["sa_total"]["rows"]}

    assert rows["당월"]["impressions"] == 200
    assert rows["전월"]["impressions"] == 100
    assert rows["전년"]["impressions"] == 50
    assert rows["MOM"]["impressions"] == pytest.approx(1.0)   # 100 → 200
    assert rows["YOY"]["impressions"] == pytest.approx(3.0)   # 50 → 200


def test_sa_total_delta_with_zero_base_is_zero_not_inf(make_weekly_raw_xlsx, svc):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=200, clicks=20, cost=2_000),
    ])
    report = svc.read_reports(content)[0]
    rows = {r["label"]: r for r in report["sa_total"]["rows"]}

    assert rows["MOM"]["impressions"] == 0.0
    assert rows["YOY"]["impressions"] == 0.0


# ── review 시트 코멘트 ───────────────────────────────────────────────────────────

def test_review_comment_attaches_to_latest_period_only(make_weekly_raw_xlsx, svc):
    """review 시트 코멘트는 '이번 주' 평이라 가장 최근 달에만 붙인다.

    옛 달에 빈 코멘트를 주는 것도 의도다 — _save_period_comments 가 빈 코멘트를
    건너뛰므로 이미 저장된 과거 코멘트를 덮어쓰지 않는다.
    """
    content = make_weekly_raw_xlsx(
        [
            weekly_raw_row(D(2026, 7, 1), "naver_sa", "SA", impressions=1, clicks=1),
            weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1, clicks=1),
        ],
        review={
            (5, 2): "■ 8월 1주차 comment",
            (6, 2): "SA 매체별 성과 분석",
            (7, 2): "네이버 SA 노출이 늘었습니다.",
            (6, 13): "DA 매체별 성과 분석",
            (7, 13): "구글 DA 신규 캠페인 라이브.",
        },
    )
    summaries = {s["period"]: s["comment"] for s in svc.list_period_summaries(content)}

    assert summaries["26년 7월"] == ""
    latest = summaries["26년 8월"]
    assert "8월 1주차 comment" in latest
    assert "SA 매체별 성과 분석" in latest
    assert "네이버 SA 노출이 늘었습니다." in latest
    assert "DA 매체별 성과 분석" in latest
    assert "구글 DA 신규 캠페인 라이브." in latest


def test_missing_review_sheet_is_not_an_error(make_weekly_raw_xlsx, svc):
    content = make_weekly_raw_xlsx([
        weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA", impressions=1, clicks=1),
    ])
    assert svc.list_period_summaries(content)[0]["comment"] == ""


def test_empty_raw_sheet_raises(make_weekly_raw_xlsx, svc):
    with pytest.raises(ValueError, match="데이터가 없습니다|읽을 수 있는 행이 없습니다"):
        svc.read_reports(make_weekly_raw_xlsx([]))
