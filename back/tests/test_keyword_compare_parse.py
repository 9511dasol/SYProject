"""KeywordCompareService.parse_file 통합 파싱 테스트 (합성 xlsx 사용).

두 가지 실제 입력 포맷을 커버한다:
- merged: 이번/저번 기간이 한 시트에 10개 컬럼으로 나란히 담긴 포맷
- raw:    한 시트=한 기간(6개 컬럼)만 담겨, 기간끼리 매칭 비교하는 포맷
"""

from app.services.keyword_compare_service import KeywordCompareService

_MERGED_HEADER = ["캠페인유형", "기기", "키워드", "전환유형",
                  "당기전환", "당기금액", "전기전환", "전기금액", "증감전환", "증감금액"]
_RAW_HEADER = ["캠페인유형", "기기", "키워드", "전환유형", "전환수", "전환매출액"]


def test_parse_merged_format(make_keyword_xlsx):
    xlsx = make_keyword_xlsx({
        "비교시트": [
            ["보고서 (2026.06.01.~2026.06.30.)"] + [""] * 9,
            _MERGED_HEADER,
            ["A", "PC", "kw1", "구매", 10, 1000, 5, 500, 5, 500],   # up
            ["A", "MO", "kw2", "가입", 0, 0, 3, 300, -3, -300],     # gone
        ],
    })
    result = KeywordCompareService().parse_file(xlsx)

    assert result["skipped"] == []
    assert len(result["sheets"]) == 1
    sheet = result["sheets"][0]
    assert sheet["period"] == "2026.06.01.~2026.06.30."
    assert sheet["summary"]["count_up"] == 1
    assert sheet["summary"]["count_gone"] == 1


def test_parse_raw_format_compares_adjacent_periods(make_keyword_xlsx):
    xlsx = make_keyword_xlsx({
        "5월": [
            ["(2026.05.01.~2026.05.31.)"] + [""] * 5,
            _RAW_HEADER,
            ["A", "PC", "kw1", "구매", 5, 500],
        ],
        "6월": [
            ["(2026.06.01.~2026.06.30.)"] + [""] * 5,
            _RAW_HEADER,
            ["A", "PC", "kw1", "구매", 10, 1000],   # 5 → 10 : up
            ["A", "PC", "kw2", "구매", 4, 400],      # 신규 : new
        ],
    })
    result = KeywordCompareService().parse_file(xlsx)

    assert len(result["sheets"]) == 1
    sheet = result["sheets"][0]
    by_kw = {r["keyword"]: r for r in sheet["rows"]}
    assert by_kw["kw1"]["status"] == "up"
    assert by_kw["kw1"]["diff_conv"] == 5.0
    assert by_kw["kw2"]["status"] == "new"
    # 기간 순서(과거 → 현재)가 유지되어야 부호가 뒤집히지 않는다
    assert sheet["period"].startswith("2026.05.01")


def test_sheet_with_too_few_rows_is_skipped(make_keyword_xlsx):
    xlsx = make_keyword_xlsx({
        "빈시트": [
            ["제목"],
            _RAW_HEADER,
        ],  # 데이터 행 없음 (총 2행 < 3)
    })
    result = KeywordCompareService().parse_file(xlsx)
    assert result["sheets"] == []
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["name"] == "빈시트"
