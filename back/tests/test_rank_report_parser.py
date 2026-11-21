"""키워드 보고서 파싱 — 포맷 변형(인코딩·보조 컬럼·디바이스 분리)을 흡수하는지.

여기가 어긋나면 적재 전체가 틀어지므로, "돌아가는지"가 아니라 약속을 본다:
합계 행은 키워드가 아니다, 같은 키워드 여러 행은 노출수 가중으로 합쳐진다,
순위 0/빈값은 '노출 없음'이지 '0위'가 아니다.
"""

import io
from datetime import date

import pandas as pd
import pytest

from app.services.rank.report_parser import (
    RankReportParseError,
    normalize_keyword,
    parse_rank_report,
)

STAT_DATE = date(2026, 11, 17)


def _csv_bytes(text: str, encoding: str = "utf-8-sig") -> bytes:
    return text.encode(encoding)


def _xlsx_bytes(rows: list[list]) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame(rows).to_excel(writer, header=False, index=False)
    return buf.getvalue()


# 라벨 안에 쉼표가 있는 컬럼은 실제 다운로드 CSV 처럼 따옴표로 감싸져 온다.
BASIC_CSV = (
    '키워드,노출수,클릭수,클릭률(%),"평균클릭비용(VAT포함,원)","총비용(VAT포함,원)",평균노출순위\n'
    "마케팅자동화,1000,50,5.0,500,25000,2.5\n"
    "리포트자동화,200,10,5.0,400,4000,4.2\n"
)


def test_parses_basic_utf8_csv():
    obs = parse_rank_report(_csv_bytes(BASIC_CSV), "report.csv", STAT_DATE)
    by_kw = {o.keyword: o for o in obs}
    assert by_kw["마케팅자동화"].avg_rank == 2.5
    assert by_kw["마케팅자동화"].impressions == 1000
    assert by_kw["마케팅자동화"].clicks == 50
    assert by_kw["마케팅자동화"].stat_date == STAT_DATE
    assert by_kw["리포트자동화"].avg_rank == 4.2


def test_parses_cp949_csv():
    obs = parse_rank_report(_csv_bytes(BASIC_CSV, "cp949"), "report.csv", STAT_DATE)
    assert {o.keyword for o in obs} == {"마케팅자동화", "리포트자동화"}


def test_skips_total_row_and_blank_keyword():
    csv = (
        "키워드,노출수,클릭수,평균노출순위\n"
        "마케팅자동화,100,5,2.0\n"
        ",50,1,3.0\n"
        "합계,150,6,2.3\n"
    )
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    assert [o.keyword for o in obs] == ["마케팅자동화"]


def test_merges_device_rows_with_impression_weighted_rank():
    csv = (
        "키워드,PC/모바일 매체,노출수,클릭수,평균노출순위\n"
        "마케팅자동화,PC,100,5,1.8\n"
        "마케팅자동화,모바일,900,45,3.0\n"
    )
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    by_device = {o.device: o for o in obs}
    assert by_device["pc"].avg_rank == 1.8
    assert by_device["mobile"].avg_rank == 3.0
    assert by_device["pc"].impressions == 100


def test_same_keyword_same_device_rows_are_aggregated():
    # 캠페인·그룹별로 쪼개진 보고서 — 같은 키워드가 여러 줄 온다.
    csv = (
        "키워드,노출수,클릭수,평균노출순위\n"
        "마케팅자동화,100,5,2.0\n"
        "마케팅자동화,300,15,4.0\n"
    )
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    assert len(obs) == 1
    # 가중 평균: (2.0*100 + 4.0*300) / 400 = 3.5
    assert obs[0].avg_rank == pytest.approx(3.5)
    assert obs[0].impressions == 400
    assert obs[0].clicks == 20


def test_zero_or_empty_rank_means_no_exposure():
    csv = (
        "키워드,노출수,클릭수,평균노출순위\n"
        "노출없는키워드,0,0,0\n"
        "빈순위키워드,0,0,\n"
    )
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    assert all(o.avg_rank is None for o in obs)


def test_xlsx_with_title_rows_and_leading_blank_column():
    # 제목·기간 행이 위에 있고 맨 앞에 보조 빈 컬럼이 있는 포맷.
    rows = [
        ["키워드 보고서", None, None, None, None],
        ["(2026.11.17.~2026.11.17.)", None, None, None, None],
        [None, "키워드", "노출수", "클릭수", "평균노출순위"],
        [None, "마케팅자동화", "1,234", 50, 2.7],
    ]
    obs = parse_rank_report(_xlsx_bytes(rows), "report.xlsx", STAT_DATE)
    assert len(obs) == 1
    assert obs[0].keyword == "마케팅자동화"
    assert obs[0].impressions == 1234  # 쉼표 숫자도 읽는다
    assert obs[0].avg_rank == 2.7


def test_rejects_file_without_rank_column():
    csv = "키워드,노출수,클릭수\n마케팅자동화,100,5\n"
    with pytest.raises(RankReportParseError) as exc:
        parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    assert "평균노출순위" in str(exc.value)


def test_rejects_empty_report():
    csv = "키워드,노출수,클릭수,평균노출순위\n"
    with pytest.raises(RankReportParseError):
        parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)


def test_normalize_keyword_ignores_spaces_and_case():
    assert normalize_keyword(" 마케팅 자동화 ") == normalize_keyword("마케팅자동화")
    assert normalize_keyword("AI Tool") == normalize_keyword("ai tool")


def test_keyword_keeps_original_spelling():
    """정규화한 값을 돌려주면 화면의 '미등록 키워드' 목록이 보고서에 없는 글자를 보여 준다."""
    csv = "키워드,노출수,클릭수,평균노출순위\nNike Air Max,100,5,2.0\n"
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    assert obs[0].keyword == "Nike Air Max"


def test_infinite_values_do_not_crash_or_persist():
    """int(float('inf')) 는 OverflowError — 잡지 않으면 422 가 아니라 500 이 된다."""
    csv = (
        "키워드,노출수,클릭수,평균노출순위\n"
        "무한노출,inf,5,2.0\n"
        "무한순위,100,5,inf\n"
    )
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    by_kw = {o.keyword: o for o in obs}
    assert by_kw["무한노출"].impressions == 0
    assert by_kw["무한순위"].avg_rank is None   # 저장되면 화면과 판정이 어긋난다


def test_repeated_header_and_subtotal_rows_are_skipped():
    """보고서를 이어붙이면 헤더가 중간에 또 들어온다 — '키워드'라는 키워드가 생기면 안 된다."""
    csv = (
        "키워드,노출수,클릭수,평균노출순위\n"
        "마케팅자동화,100,5,2.0\n"
        "키워드,노출수,클릭수,평균노출순위\n"
        "리포트자동화,200,10,4.0\n"
        "소계,300,15,3.0\n"
        "총계,300,15,3.0\n"
    )
    obs = parse_rank_report(_csv_bytes(csv), "report.csv", STAT_DATE)
    assert sorted(o.keyword for o in obs) == ["리포트자동화", "마케팅자동화"]
