"""marketing_service 의 입력 해석 로직 — CSV 포맷 감지·기간 추출·매체 분류.

이 서비스는 매체마다 다른 CSV 를 받아 들이는 입구라서, 매체가 내보내기 양식을 바꿀
때마다 조용히 깨져 왔다(코드 주석에 "전환 가치 → 모든 전환 가치 변경으로 500" 같은
이력이 남아 있다). 가장 복잡하고 회귀가 잦은 부분인데 직접 테스트가 없었다.

여기서는 DB·AI 없이 순수 파싱·분류·집계만 고정한다.
"""

import pandas as pd
import pytest

from app.services.marketing_service import (
    MarketingService,
    _is_conversion,
    _is_google_campaign,
    _is_google_conversion,
    _is_kakao,
    _is_single_media_daily,
    _period_from_content,
    _pick_column,
    _read_csv,
    _to_date,
    _to_number,
)


class _NullRepo:
    """DB 를 건드리지 않는 대역 — 파싱·집계만 볼 때 쓴다."""

    def save_from_kpis(self, media_kpis, media_authority=None, conv_authority=None):
        return 0, {}, ""


@pytest.fixture
def svc() -> MarketingService:
    return MarketingService(_NullRepo())


# ── CSV 포맷·인코딩 감지 ─────────────────────────────────────────────────────


def _naver_csv(encoding: str = "utf-8-sig") -> bytes:
    """네이버 보고서 — 1행이 제목, 2행이 컬럼명."""
    text = (
        "다운로드 보고서 (2026.06.01.~2026.06.30.)\n"
        "일별,캠페인유형,노출수,클릭수,총비용\n"
        "2026.06.01.,파워링크,1000,50,30000\n"
    )
    return text.encode(encoding)


def _kakao_csv() -> bytes:
    """카카오 맞춤보고서 — 1행이 바로 컬럼명."""
    text = "시작일,노출수,클릭수,비용\n2026-06-01,500,20,8000\n"
    return text.encode("utf-8-sig")


def test_naver_report_skips_the_title_row(svc):
    df = _read_csv(_naver_csv())
    assert list(df.columns)[:2] == ["일별", "캠페인유형"]
    assert len(df) == 1


def test_kakao_report_uses_the_first_row_as_header():
    df = _read_csv(_kakao_csv())
    assert "시작일" in df.columns
    assert len(df) == 1


def test_cp949_encoded_report_is_readable():
    """윈도우 엑셀에서 저장하면 cp949 로 떨어진다 — utf-8 만 시도하면 깨진다."""
    df = _read_csv(_naver_csv(encoding="cp949"))
    assert "캠페인유형" in df.columns


def test_xlsx_upload_is_rejected_with_guidance():
    """엑셀을 CSV 자리에 올리는 실수가 잦다 — 어느 탭으로 가야 하는지 알려줘야 한다."""
    with pytest.raises(ValueError, match="Excel 불러오기"):
        _read_csv(b"PK\x03\x04" + b"\x00" * 50)


def test_google_utf16_tab_export_is_parsed():
    """구글 데이터 관리자는 UTF-16 + 탭 구분 + 제목·기간 2줄이 앞에 붙는다."""
    lines = [
        "(HM) weekly_캠페인데이터",
        "2026년 6월 1일 - 2026년 6월 30일",
        "\t".join(["일", "캠페인 유형", "노출수", "클릭수", "비용(VAT포함)"]),
        "\t".join(["2026-06-01", "검색", "100", "10", "5000"]),
    ]
    content = ("\r\n".join(lines) + "\r\n").encode("utf-16")

    df = _read_csv(content)
    assert list(df.columns) == ["일", "캠페인 유형", "노출수", "클릭수", "비용(VAT포함)"]
    assert len(df) == 1


# ── 매체 분류 ────────────────────────────────────────────────────────────────


def test_kakao_is_detected_by_start_date_without_campaign_type():
    assert _is_kakao(_read_csv(_kakao_csv())) is True


def test_naver_report_is_not_mistaken_for_kakao():
    assert _is_kakao(_read_csv(_naver_csv())) is False


def test_single_media_daily_report_is_detected():
    """파워컨텐츠처럼 한 매체만 받으면 캠페인유형 컬럼이 아예 없다."""
    df = pd.DataFrame(columns=["일별", "노출수", "클릭수", "총비용"])
    assert _is_single_media_daily(df) is True


def test_report_with_campaign_type_is_not_single_media():
    df = pd.DataFrame(columns=["일별", "캠페인유형", "노출수", "클릭수", "총비용"])
    assert _is_single_media_daily(df) is False


def test_naver_conversion_file_is_detected():
    df = pd.DataFrame(columns=["일별", "전환 유형", "전환수"])
    assert _is_conversion(df) is True


def test_google_campaign_and_conversion_files_are_told_apart():
    campaign = pd.DataFrame(columns=["일", "캠페인 유형", "노출수", "클릭수", "비용(VAT포함)"])
    conversion = pd.DataFrame(columns=["일", "캠페인 유형", "전환 액션", "전환", "모든 전환 가치"])

    assert _is_google_campaign(campaign) is True
    assert _is_google_conversion(campaign) is False
    assert _is_google_conversion(conversion) is True
    assert _is_conversion(conversion) is True


# ── 컬럼명이 바뀌어도 버티는가 (실제 500 회귀 지점) ───────────────────────────


@pytest.mark.parametrize("value_column", ["모든 전환 가치", "전환 가치", "모든 전환값", "전환값"])
def test_conversion_value_column_aliases_are_all_accepted(value_column):
    """구글이 라벨을 바꿔도 업로드가 통째로 실패하면 안 된다."""
    df = pd.DataFrame(columns=["일", "캠페인 유형", "전환 액션", "전환", value_column])
    assert _is_google_conversion(df) is True


@pytest.mark.parametrize("count_column", ["전환", "전환수", "모든 전환", "모든 전환수"])
def test_conversion_count_column_aliases_are_all_accepted(count_column):
    df = pd.DataFrame(columns=["일", "캠페인 유형", "전환 액션", count_column])
    assert _is_google_conversion(df) is True


def test_pick_column_returns_none_when_nothing_matches():
    df = pd.DataFrame(columns=["일", "캠페인 유형"])
    assert _pick_column(df, ("전환", "전환수")) is None


# ── 숫자·날짜 변환 ───────────────────────────────────────────────────────────


def test_thousands_separator_is_stripped():
    """구글 내보내기는 '54,312.07' 처럼 쉼표가 낀 채로 온다."""
    out = _to_number(pd.Series(["54,312.07", "1,000", "7"]))
    assert list(out) == [54312.07, 1000.0, 7.0]


def test_unparseable_number_becomes_zero():
    """빈칸·'-' 같은 값이 NaN 으로 남으면 합계가 통째로 NaN 이 된다."""
    assert list(_to_number(pd.Series(["", "-", "12"]))) == [0.0, 0.0, 12.0]


@pytest.mark.parametrize("raw", ["2026.06.01.", "2026.06.01", "2026-06-01"])
def test_both_date_formats_are_parsed(raw):
    assert _to_date(raw) == pd.Timestamp("2026-06-01")


def test_unknown_date_format_returns_none():
    assert _to_date("06/01/2026") is None


# ── 기간 추출 ────────────────────────────────────────────────────────────────


def test_period_comes_from_the_filename_date(svc):
    svc._extract_period("네이버_20260501_report.csv")
    assert svc.current_period == "26년 5월"


@pytest.mark.parametrize(
    "filename",
    [
        "26.07.csv",
        "26_07.csv",
        "report 26.07.csv",
        # 아래 둘이 회귀 지점 — 밑줄·한글은 단어 문자라 \b 경계가 생기지 않아
        # 기간을 못 읽고 기본값("26년 5월")으로 조용히 넘어갔다.
        "report_26.07.csv",
        "네이버_26_07.csv",
    ],
)
def test_period_accepts_short_year_month_filenames(svc, filename):
    svc._extract_period(filename)
    assert svc.current_period == "26년 7월"


def test_period_does_not_cut_two_digits_out_of_a_longer_number(svc):
    """숫자열 한가운데를 잘라 엉뚱한 기간을 만들면 안 된다."""
    before = svc.current_period
    svc._extract_period("export_1234567.csv")
    assert svc.current_period == before


@pytest.mark.parametrize(
    "filename",
    [
        "네이버_05.01~05.31.csv",        # 날짜 범위 — 연도로 읽으면 "5년 1월"
        "네이버SA_05.01-05.31_실적.csv",
        "카카오_1차_10.05_수정본.csv",     # 10월 5일 — "10년 5월"이 아니다
        "네이버_파워링크_11.03_최종.csv",
    ],
)
def test_date_tokens_are_not_mistaken_for_a_period(svc, filename):
    """MM.DD 날짜를 연·월로 읽으면 2005년·2010년짜리 빈 리포트가 나온다.

    파일명에서 못 찾으면 CSV 제목행에서 찾는 경로가 남아 있고, 그쪽이 더 믿을 만하다.
    """
    svc._extract_period(filename)
    assert svc.current_period == "26년 5월"  # 기본값 — 파일명에서 읽지 않았다


def test_date_range_filename_falls_back_to_the_title_row(svc):
    """날짜 범위 이름이어도 CSV 제목행이 있으면 거기서 기간을 읽어야 한다."""
    svc._extract_period("네이버_05.01~05.31.csv", _naver_csv())
    assert svc.current_period == "26년 6월"


def test_invalid_month_in_filename_is_ignored(svc):
    """26_13 은 월이 아니다 — 잘못 읽으면 13월짜리 기간이 만들어진다."""
    before = svc.current_period
    svc._extract_period("report_26_13.csv")
    assert svc.current_period == before


def test_period_falls_back_to_the_naver_title_row(svc):
    """파일명에 날짜가 없으면 CSV 제목 줄의 기간을 쓴다."""
    svc._extract_period("실적.csv", _naver_csv())
    assert svc.current_period == "26년 6월"


def test_period_falls_back_to_the_google_utf16_header(svc):
    """구글 파일은 UTF-16 이라 바이트 정규식으로는 못 찾는다 — 디코딩 후 탐색해야 한다."""
    content = ("제목\r\n2026년 6월 1일 - 2026년 6월 30일\r\n일\t캠페인 유형\r\n").encode("utf-16")
    svc._extract_period("실적.csv", content)
    assert svc.current_period == "26년 6월"


def test_period_from_content_returns_none_when_absent():
    assert _period_from_content("아무 기간도 없는 제목\n".encode("utf-8")) is None


# ── 카카오 KPI 집계 ──────────────────────────────────────────────────────────


def test_kakao_kpis_aggregate_by_day_and_derive_ratios(svc):
    df = pd.DataFrame({
        "시작일": ["2026-06-01", "2026-06-01", "2026-06-02"],
        "노출수": ["1,000", "1,000", "500"],
        "클릭수": ["50", "50", "10"],
        "비용": ["10,000", "10,000", "4,000"],
    })

    daily = svc._calc_kakao_kpis(df)["카카오SA"]

    assert len(daily) == 2  # 같은 날짜는 합산
    first = daily.iloc[0]
    assert first["impressions"] == 2000
    assert first["clicks"] == 100
    assert first["cost"] == 20000
    assert first["ctr"] == pytest.approx(0.05)     # 100 / 2000
    assert first["cpc"] == pytest.approx(200.0)    # 20000 / 100
    # 카카오 맞춤보고서에는 전환 정보가 없다 — 0 으로 둔다
    assert first["total_conv"] == 0 and first["revenue"] == 0


def test_kakao_kpis_do_not_divide_by_zero(svc):
    """노출·클릭이 0인 날이 있으면 비율 계산이 inf/NaN 이 되기 쉽다."""
    df = pd.DataFrame({"시작일": ["2026-06-01"], "노출수": ["0"], "클릭수": ["0"], "비용": ["0"]})

    row = svc._calc_kakao_kpis(df)["카카오SA"].iloc[0]
    assert row["ctr"] == 0 and row["cpc"] == 0


# ── 모르는 캠페인유형 처리 ───────────────────────────────────────────────────


def test_unknown_campaign_types_are_collected_as_kakao(svc):
    """매핑에 없는 유형을 버리면 그만큼 실적이 통째로 사라진다."""
    df = pd.DataFrame({
        "일별": ["2026.06.01.", "2026.06.01."],
        "캠페인유형": ["파워링크", "쇼핑검색"],   # 쇼핑검색은 매핑에 없음
        "노출수": ["1000", "300"],
        "클릭수": ["50", "9"],
        "총비용": ["30,000", "2,000"],
    })

    result = svc._calc_unknown_as_kakao(df)

    assert set(result) == {"카카오SA"}
    row = result["카카오SA"].iloc[0]
    assert row["impressions"] == 300   # 파워링크(매핑된 유형)는 섞이지 않는다
    assert row["cost"] == 2000


def test_all_known_campaign_types_produce_nothing(svc):
    df = pd.DataFrame({
        "일별": ["2026.06.01."], "캠페인유형": ["파워링크"],
        "노출수": ["1000"], "클릭수": ["50"], "총비용": ["30000"],
    })
    assert svc._calc_unknown_as_kakao(df) == {}


def test_media_label_mapping(svc):
    assert svc._media_name("파워링크") == "네이버SA"
    assert svc._media_name("검색") == "구글SA"
    assert svc._media_name("듣도보도못한유형") == "카카오SA"


# ── 파일 분류 (전환 / 매체) ──────────────────────────────────────────────────


def test_classify_splits_conversion_and_media_files(svc):
    conv_csv = "일별,전환 유형,전환수\n2026.06.01.,구매,3\n".encode("utf-8-sig")
    media_csv = _naver_csv()

    conv_files, media_files = svc._classify([(conv_csv, "전환.csv"), (media_csv, "매체.csv")])

    assert [name for _, name in conv_files] == ["전환.csv"]
    assert [name for _, name in media_files] == ["매체.csv"]
