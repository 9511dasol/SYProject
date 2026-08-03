"""구글 Ads 데이터 관리자 CSV 업로드 — 캠페인/전환 파일을 따로 올려도 반영되어야 한다.

의뢰자 보고: 캠페인데이터는 올라가는데 전환데이터는 서버 에러(500). 원인은 전환 가치
컬럼명이 "전환 가치" → "모든 전환 가치" 로 바뀌었는데 코드가 옛 이름만 찾은 것.

CSV 픽스처는 바이너리를 커밋하지 않고 즉석 생성한다(conftest 방침). 구글 내보내기는
UTF-16 BOM + 탭 구분에 제목·기간 2줄이 앞에 붙고, 숫자에 천 단위 쉼표가 들어간
칸은 따옴표로 감싸여 온다 — 이 형식 자체가 회귀 지점이라 그대로 재현한다.
"""

import asyncio

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.models.marketing_model import MarketingData, resolve_total_conv
from app.repositories import marketing_repo
from app.repositories.marketing_repo import MarketingRepository
from app.services.marketing_service import MarketingService, _read_csv

CAMPAIGN_HEADER = ["일", "캠페인 유형", "캠페인", "광고그룹", "기기", "노출수", "클릭수", "비용(VAT포함)"]
CONVERSION_HEADER = ["일", "캠페인 유형", "캠페인", "광고그룹", "기기", "전환 액션", "전환", "모든 전환 가치"]


def _google_csv(title: str, header: list[str], rows: list[list]) -> bytes:
    """구글 Ads 내보내기 재현: UTF-16(BOM) + 탭 구분, 1행 제목 / 2행 기간 / 3행 컬럼명."""
    lines = [title, "2026년 7월 1일 - 2026년 7월 31일", "\t".join(header)]
    lines += ["\t".join(str(v) for v in row) for row in rows]
    return ("\r\n".join(lines) + "\r\n").encode("utf-16")


@pytest.fixture
def campaign_csv() -> bytes:
    return _google_csv(
        "(HM) weekly_캠페인데이터",
        CAMPAIGN_HEADER,
        [
            ["2026-07-01", "검색", "PC_아이비김영", "B_자사브랜드", "컴퓨터", "797", "613", '"54,312.07"'],
            ["2026-07-01", "검색", "PC_아이비김영", "H_OL_인강", "컴퓨터", "54", "32", '"14,471.41"'],
            ["2026-07-02", "검색", "MO_아이비김영", "B_자사브랜드", "휴대전화", "100", "40", "1000.00"],
        ],
    )


@pytest.fixture
def conversion_csv() -> bytes:
    return _google_csv(
        "(HM) weekly_전환데이터",
        CONVERSION_HEADER,
        [
            ["2026-07-01", "검색", "PC_아이비김영", "B_자사브랜드", "컴퓨터", "인강구매완료", "63.30", '"19,138,337.62"'],
            ["2026-07-01", "검색", "PC_아이비김영", "B_자사브랜드", "컴퓨터", "인강구매완료_의약", "2.00", '"111,000.00"'],
            ["2026-07-01", "검색", "PC_아이비김영", "A_대표_편입", "컴퓨터", "설명회신청", "1.08", "1.08"],
            ["2026-07-01", "검색", "PC_아이비김영", "C_편입수학", "컴퓨터", "회원가입", "4.00", "4.00"],
            ["2026-07-02", "검색", "MO_아이비김영", "B_자사브랜드", "휴대전화", "회원가입", "1.50", "1.50"],
            # 매핑에 없는 전환 액션은 버려야 한다 (총 전환수에 섞이면 안 됨)
            ["2026-07-02", "검색", "MO_아이비김영", "B_자사브랜드", "휴대전화", "장바구니담기", "99.00", "99.00"],
        ],
    )


class _RecordingRepo:
    """save_from_kpis 호출 인자를 붙잡아 두는 대역 — DB 없이 서비스 계층만 검증한다."""

    def __init__(self):
        self.media_kpis = None
        self.media_authority = None
        self.conv_authority = None

    def save_from_kpis(self, media_kpis, media_authority=None, conv_authority=None):
        self.media_kpis = media_kpis
        self.media_authority = media_authority
        self.conv_authority = conv_authority
        return sum(len(df) for df in media_kpis.values()), {}, "undo-test"


def _upload(files: list[tuple[bytes, str]]) -> tuple[dict, _RecordingRepo]:
    """업로드 엔드포인트와 같은 순서로 분류 → 분석을 돌린다."""
    repo = _RecordingRepo()
    svc = MarketingService(repo)
    conv_files, media_files = svc._classify(files)
    result = asyncio.run(svc.process_and_analyze(conv_files, media_files))
    return result, repo


def _totals(df, *columns) -> dict[str, float]:
    return {c: round(float(df[c].sum()), 2) for c in columns}


# ── 분류 ─────────────────────────────────────────────────────────────────────


def test_conversion_file_is_classified_as_conversion(conversion_csv):
    """'모든 전환 가치' 로 컬럼명이 바뀌어도 전환 파일로 알아봐야 한다."""
    svc = MarketingService(_RecordingRepo())
    conv_files, media_files = svc._classify([(conversion_csv, "전환데이터.csv")])
    assert len(conv_files) == 1
    assert media_files == []


def test_campaign_file_is_classified_as_media(campaign_csv):
    svc = MarketingService(_RecordingRepo())
    conv_files, media_files = svc._classify([(campaign_csv, "캠페인데이터.csv")])
    assert conv_files == []
    assert len(media_files) == 1


# ── 회귀: 전환 파일 단독 업로드가 500 이었다 ──────────────────────────────────


def test_conversion_only_upload_does_not_raise(conversion_csv):
    """이 파일만 올리면 KeyError('전환 가치') 로 500 이 났다."""
    result, _ = _upload([(conversion_csv, "전환데이터.csv")])
    assert "구글SA" in result["media_kpis"]


def test_conversion_only_upload_reflects_every_conversion(conversion_csv):
    result, _ = _upload([(conversion_csv, "전환데이터.csv")])
    daily = result["media_kpis"]["구글SA"]

    # 구매 = 인강구매완료(63.30) + 인강구매완료_의약(2.00), 가입 = 4.00 + 1.50
    assert _totals(daily, "purchase", "signup", "apply", "revenue") == {
        "purchase": 65.30,
        "signup": 5.50,
        "apply": 1.08,
        "revenue": 19_249_337.62,
    }
    # 매핑에 없는 '장바구니담기' 99건은 총 전환수에 섞이지 않는다
    assert round(float(daily["total_conv"].sum()), 2) == 71.88


def test_conversion_only_upload_leaves_media_metrics_at_zero(conversion_csv):
    result, _ = _upload([(conversion_csv, "전환데이터.csv")])
    daily = result["media_kpis"]["구글SA"]
    assert _totals(daily, "impressions", "clicks", "cost") == {
        "impressions": 0.0,
        "clicks": 0.0,
        "cost": 0.0,
    }


def test_upload_without_a_conversion_value_column_still_succeeds():
    """전환수만 골라 내보낸 파일 — 매출이 0일 뿐 업로드가 실패하면 안 된다."""
    csv = _google_csv(
        "(HM) weekly_전환데이터",
        ["일", "캠페인 유형", "캠페인", "광고그룹", "기기", "전환 액션", "전환"],
        [["2026-07-01", "검색", "PC_아이비김영", "B_자사브랜드", "컴퓨터", "회원가입", "4.00"]],
    )
    result, _ = _upload([(csv, "전환데이터.csv")])
    daily = result["media_kpis"]["구글SA"]
    assert _totals(daily, "signup", "revenue") == {"signup": 4.0, "revenue": 0.0}


# ── 캠페인 단독 / 두 파일 함께 ───────────────────────────────────────────────


def test_campaign_only_upload_reflects_media_metrics(campaign_csv):
    result, _ = _upload([(campaign_csv, "캠페인데이터.csv")])
    daily = result["media_kpis"]["구글SA"]
    assert _totals(daily, "impressions", "clicks", "cost") == {
        "impressions": 951.0,
        "clicks": 685.0,
        "cost": 69_783.48,
    }
    assert _totals(daily, "purchase", "signup", "apply") == {
        "purchase": 0.0, "signup": 0.0, "apply": 0.0,
    }


def test_both_files_together_reflect_media_and_conversions(campaign_csv, conversion_csv):
    result, _ = _upload([(conversion_csv, "전환데이터.csv"), (campaign_csv, "캠페인데이터.csv")])
    daily = result["media_kpis"]["구글SA"]
    assert _totals(daily, "impressions", "clicks", "cost") == {
        "impressions": 951.0, "clicks": 685.0, "cost": 69_783.48,
    }
    assert _totals(daily, "purchase", "signup", "apply", "revenue") == {
        "purchase": 65.30, "signup": 5.50, "apply": 1.08, "revenue": 19_249_337.62,
    }


def test_google_files_land_on_the_google_media_label(campaign_csv, conversion_csv):
    """두 파일 모두 '구글SA' 로만 들어가야 한다 (카카오SA 폴백으로 새면 안 됨)."""
    result, _ = _upload([(conversion_csv, "전환데이터.csv"), (campaign_csv, "캠페인데이터.csv")])
    assert list(result["media_kpis"]) == ["구글SA"]


def test_conversions_outside_the_campaign_dates_are_not_dropped(campaign_csv):
    """캠페인 파일에 없는 날짜의 전환도 살아남아야 한다 (예전엔 left 조인이라 사라졌다)."""
    conv = _google_csv(
        "(HM) weekly_전환데이터",
        CONVERSION_HEADER,
        [["2026-07-09", "검색", "PC_아이비김영", "B_자사브랜드", "컴퓨터", "회원가입", "7.00", "7.00"]],
    )
    result, _ = _upload([(conv, "전환데이터.csv"), (campaign_csv, "캠페인데이터.csv")])
    daily = result["media_kpis"]["구글SA"]
    assert float(daily["signup"].sum()) == 7.0
    assert "2026-07-09" in set(daily["date"].astype(str).str[:10])


def test_period_is_read_from_the_conversion_file_alone(conversion_csv):
    """전환 파일만 올려도 기간을 읽어야 한다 — 파일명에는 연월이 없다."""
    result, _ = _upload([(conversion_csv, "전환데이터.csv")])
    assert result["period"] == "26년 7월"


# ── 나눠 올릴 때 어느 쪽 값을 갱신할 권한이 있는지 ───────────────────────────


def test_conversion_only_upload_claims_no_media_authority(conversion_csv):
    """전환만 올렸으면 노출·클릭·비용은 이번 업로드가 건드릴 값이 아니다."""
    _, repo = _upload([(conversion_csv, "전환데이터.csv")])
    assert repo.media_authority == {"구글SA": False}
    assert repo.conv_authority == {"구글SA": True}


def test_campaign_only_upload_claims_no_conversion_authority(campaign_csv):
    _, repo = _upload([(campaign_csv, "캠페인데이터.csv")])
    assert repo.media_authority == {"구글SA": True}
    assert repo.conv_authority == {"구글SA": False}


def test_both_files_claim_both_authorities(campaign_csv, conversion_csv):
    _, repo = _upload([(conversion_csv, "전환데이터.csv"), (campaign_csv, "캠페인데이터.csv")])
    assert repo.media_authority == {"구글SA": True}
    assert repo.conv_authority == {"구글SA": True}


def test_google_conversions_survive_a_naver_only_media_file(conversion_csv):
    """구글 전환 + 네이버 매체를 섞어 올려도 구글 전환이 사라지면 안 된다.

    예전에는 매체 파일이 하나라도 있으면 전환 전용 처리를 건너뛰어, 구글 캠페인
    파일이 빠진 배치에서 구글 전환이 에러도 없이 통째로 유실됐다.
    """
    naver = (
        "네이버 검색광고 보고서\n"
        "일별,캠페인유형,노출수,클릭수,총비용\n"
        "2026.07.01.,파워링크,1000,100,50000\n"
    ).encode("utf-8-sig")

    result, repo = _upload([(conversion_csv, "전환데이터.csv"), (naver, "네이버.csv")])

    assert "네이버SA" in result["media_kpis"]
    assert "구글SA" in result["media_kpis"]
    assert float(result["media_kpis"]["구글SA"]["purchase"].sum()) == 65.30
    # 구글SA 는 전환만 받았으므로 노출·클릭·비용 갱신 권한이 없다
    assert repo.media_authority["구글SA"] is False
    assert repo.media_authority["네이버SA"] is True


# ── 총 전환수 소수점 ─────────────────────────────────────────────────────────


def test_total_conv_keeps_fractional_google_conversions(conversion_csv):
    """구글 전환수는 소수로 온다 — 65.30 + 5.50 + 1.08 이 71.88 로 남아야 한다."""
    result, _ = _upload([(conversion_csv, "전환데이터.csv")])
    assert round(float(result["media_kpis"]["구글SA"]["total_conv"].sum()), 2) == 71.88


def test_resolve_total_conv_prefers_the_breakdown():
    """정수 컬럼에 66 으로 잘려 저장돼 있어도 세부 합(66.38)을 쓴다."""
    assert resolve_total_conv(66, 2.00, 63.30, 1.08) == pytest.approx(66.38)


def test_resolve_total_conv_falls_back_to_the_stored_total():
    """세부 항목 컬럼이 없는 엑셀에서 불러온 행은 저장된 총합이 유일한 값이다."""
    assert resolve_total_conv(123, 0, 0, 0) == 123.0


def test_resolve_total_conv_handles_nulls():
    assert resolve_total_conv(None, None, None, None) == 0.0


# ── 나눠 올릴 때 기존 DB 값이 지켜지는지 (실제 UPSERT) ───────────────────────


@pytest.fixture
def sqlite_upsert(monkeypatch):
    """marketing_repo 의 engine 을 SQLite 로 갈아 끼운다.

    _upsert / _insert_chunk 는 모듈 전역 engine 을 쓰고, 되돌리기 스냅샷은 별도
    세션(SessionLocal)으로 저장한다 — 여기서는 UPSERT 결과만 보므로 스냅샷은 끈다.
    """
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    MarketingData.__table__.create(engine)
    monkeypatch.setattr(marketing_repo, "engine", engine)
    monkeypatch.setattr(marketing_repo, "_save_undo_snapshot", lambda undo_id, rows: None)
    try:
        yield engine
    finally:
        engine.dispose()


def _row(engine, report_date="2026-07-01", campaign_type="구글SA") -> dict:
    with engine.begin() as conn:
        r = conn.execute(
            text(
                "SELECT impressions, clicks, cost, conversions, conversion_revenue, "
                "signup, purchase, apply FROM marketing_data "
                "WHERE report_date = :d AND campaign_type = :c"
            ),
            {"d": report_date, "c": campaign_type},
        ).fetchone()
    return dict(r._mapping)


def _save(kpis_row: dict, *, has_media: bool, has_conv: bool) -> None:
    """save_from_kpis 를 한 행짜리 KPI 로 호출한다."""
    import pandas as pd

    daily = pd.DataFrame([{"date": "2026-07-01", **kpis_row}])
    MarketingRepository(None).save_from_kpis(
        {"구글SA": daily}, {"구글SA": has_media}, {"구글SA": has_conv}
    )


MEDIA_ROW = {"impressions": 951, "clicks": 685, "cost": 69_783.48}
CONV_ROW = {"total_conv": 71.88, "revenue": 19_249_337.62, "signup": 5.5, "purchase": 65.3, "apply": 1.08}
ZEROS = {"impressions": 0, "clicks": 0, "cost": 0.0, "total_conv": 0, "revenue": 0.0,
         "signup": 0.0, "purchase": 0.0, "apply": 0.0}


def test_conversion_only_upload_keeps_media_values_already_in_db(sqlite_upsert):
    """캠페인 → 전환 순으로 나눠 올려도 노출·클릭·비용이 0으로 덮이면 안 된다."""
    _save({**ZEROS, **MEDIA_ROW}, has_media=True, has_conv=False)
    _save({**ZEROS, **CONV_ROW}, has_media=False, has_conv=True)

    row = _row(sqlite_upsert)
    assert (row["impressions"], row["clicks"]) == (951, 685)
    assert row["cost"] == pytest.approx(69_783.48)
    assert row["purchase"] == pytest.approx(65.3)
    assert row["conversion_revenue"] == pytest.approx(19_249_337.62)


def test_campaign_only_upload_keeps_conversion_values_already_in_db(sqlite_upsert):
    """반대 순서 — 전환 → 캠페인으로 올려도 전환·매출이 살아 있어야 한다."""
    _save({**ZEROS, **CONV_ROW}, has_media=False, has_conv=True)
    _save({**ZEROS, **MEDIA_ROW}, has_media=True, has_conv=False)

    row = _row(sqlite_upsert)
    assert row["purchase"] == pytest.approx(65.3)
    assert row["signup"] == pytest.approx(5.5)
    assert row["conversion_revenue"] == pytest.approx(19_249_337.62)
    assert row["impressions"] == 951


def test_a_brand_new_date_stores_zero_for_the_missing_side(sqlite_upsert):
    """DB에 없던 날짜는 참고할 기존 값이 없으므로 안 올라온 쪽을 0으로 둔다."""
    _save({**ZEROS, **CONV_ROW}, has_media=False, has_conv=True)

    row = _row(sqlite_upsert)
    assert (row["impressions"], row["clicks"], row["cost"]) == (0, 0, 0)
    assert row["purchase"] == pytest.approx(65.3)


def test_reuploading_the_same_side_overwrites_it(sqlite_upsert):
    """같은 쪽을 다시 올리면 최신 값으로 갱신된다 (유지 규칙이 갱신을 막으면 안 된다)."""
    _save({**ZEROS, **MEDIA_ROW}, has_media=True, has_conv=False)
    _save({**ZEROS, "impressions": 1, "clicks": 1, "cost": 1.0}, has_media=True, has_conv=False)

    row = _row(sqlite_upsert)
    assert (row["impressions"], row["clicks"], row["cost"]) == (1, 1, 1.0)


def test_stored_conversions_round_instead_of_truncating(sqlite_upsert):
    """정수 컬럼이라 소수점은 잃지만, 잘라내기(71)보다 반올림(72)이 덜 틀리다."""
    _save({**ZEROS, **CONV_ROW}, has_media=False, has_conv=True)
    assert _row(sqlite_upsert)["conversions"] == 72


def test_csv_thousand_separators_are_parsed(campaign_csv):
    """'"54,312.07"' 처럼 따옴표 + 쉼표로 오는 칸이 문자열로 남으면 안 된다."""
    df = _read_csv(campaign_csv)
    assert list(df.columns) == CAMPAIGN_HEADER
    assert len(df) == 3
