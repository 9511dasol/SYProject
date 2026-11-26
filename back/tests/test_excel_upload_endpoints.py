"""엑셀 업로드 엔드포인트의 HTTP 계층 테스트.

지금까지 이 경로는 서비스·헬퍼 단위로만 테스트돼 있었다. 확장자 허용 목록·양식 판별·
response_model 검증처럼 **라우터에서만 일어나는 일**은 아무도 지키지 않았고, 새 양식을
붙이면서 늘어난 분기가 바로 그 지점에 있다.

DB 를 건드리지 않는 두 엔드포인트(`/excel-periods`, `/load-excel`)만 다룬다 — 저장
경로는 커넥션 분리(engine.begin())를 전제로 짜여 있어 TestClient 로는 의미 있게
세울 수 없고, 저장 로직 자체는 test_excel_upload_comments 가 덮는다.
"""

import datetime as dt

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.models.user_model import User
from app.routers import marketing_router
from tests.conftest import weekly_raw_row

D = dt.date


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(marketing_router.router)
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, email="user@example.com", role="member", company_id=1
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _upload(client, path: str, content: bytes, filename: str, **params):
    return client.post(
        path,
        files={"file": (filename, content, "application/octet-stream")},
        params=params or None,
    )


@pytest.fixture
def weekly_bytes(make_weekly_raw_xlsx):
    return make_weekly_raw_xlsx(
        [
            weekly_raw_row(D(2026, 7, 31), "naver_sa", "SA",
                           impressions=100, clicks=10, cost=1_000),
            weekly_raw_row(D(2026, 8, 1), "naver_sa", "SA",
                           impressions=200, clicks=20, cost=2_000,
                           conversions=3, signup=1, purchase=2, revenue=90_000),
            # 전환·매출만 있는 행 — 라우터를 통과해도 살아남아야 한다
            weekly_raw_row(D(2026, 8, 2), "naverbs_pc", "BS",
                           conversions=7, purchase=6, revenue=511_100),
            weekly_raw_row(D(2026, 8, 2), "google_p-max", "DA",
                           impressions=50, clicks=5, cost=500),
        ],
        review={
            (5, 2): "■ 8월 1주차 comment",
            (6, 2): "SA 매체별 성과 분석",
            (7, 2): "네이버 SA 노출 증가.",
        },
    )


@pytest.fixture
def monthly_bytes(make_report_xlsx):
    return make_report_xlsx("26년 5월", {
        "summary_26년 5월": {
            (3, 2): 10, (3, 3): 20, (3, 4): 31,
            (32, 2): "월간 템플릿 코멘트",
            (70, 2): dt.datetime(2026, 5, 1), (70, 3): 1_000, (70, 4): 100,
        },
        "네이버SA_26년 5월": {
            (21, 2): "날짜", (21, 3): "노출", (21, 4): "클릭", (21, 8): "광고비(vat+)",
            (23, 2): dt.datetime(2026, 5, 1), (23, 3): 1_000, (23, 4): 100, (23, 8): 5_000,
        },
    })


# ── /excel-periods ──────────────────────────────────────────────────────────────

def test_excel_periods_reads_weekly_raw_format(client, weekly_bytes):
    res = _upload(client, "/api/marketing/excel-periods", weekly_bytes, "Weekly Report.xlsx")
    assert res.status_code == 200, res.text

    periods = res.json()["periods"]
    assert [p["period"] for p in periods] == ["26년 7월", "26년 8월"]
    assert [p["days"] for p in periods] == [1, 2]
    # review 코멘트는 가장 최근 기간에만
    assert periods[0]["comment"] == ""
    assert "8월 1주차 comment" in periods[1]["comment"]


def test_excel_periods_still_reads_monthly_template(client, monthly_bytes):
    """기존 양식이 그대로 동작하는지 — 레지스트리 도입의 회귀 방어."""
    res = _upload(client, "/api/marketing/excel-periods", monthly_bytes, "마케팅분석_26년5월.xlsx")
    assert res.status_code == 200, res.text

    periods = res.json()["periods"]
    assert [p["period"] for p in periods] == ["26년 5월"]
    assert periods[0]["comment"] == "월간 템플릿 코멘트"


def test_excel_periods_accepts_xlsb_extension(client, weekly_bytes):
    """.xlsb 가 확장자 검사를 통과해야 한다 — REPORT_EXTENSIONS 회귀 방어.

    내용은 xlsx 지만 양식 판별은 시트 구성으로 하므로 .xlsb 이름으로도 읽힌다.
    여기서 415 가 나면 대행사 주간 리포트를 아예 올릴 수 없다.
    """
    res = _upload(client, "/api/marketing/excel-periods", weekly_bytes, "Weekly Report.xlsb")
    assert res.status_code == 200, res.text
    assert len(res.json()["periods"]) == 2


def test_excel_periods_rejects_csv(client, weekly_bytes):
    res = _upload(client, "/api/marketing/excel-periods", weekly_bytes, "report.csv")
    assert res.status_code == 415


def test_excel_periods_rejects_unknown_format(client, make_report_xlsx):
    """어느 양식도 아닌 엑셀은 422 로, 무엇이 들어 있었는지 알려 준다."""
    content = make_report_xlsx("x", {"16일": {(1, 1): "키워드"}})
    res = _upload(client, "/api/marketing/excel-periods", content, "키워드비교.xlsx")

    assert res.status_code == 422
    assert "지원하는 리포트 양식이 아닙니다" in res.json()["detail"]


def test_excel_periods_rejects_empty_file(client):
    res = _upload(client, "/api/marketing/excel-periods", b"", "empty.xlsx")
    assert res.status_code == 400


# ── /load-excel ─────────────────────────────────────────────────────────────────

def test_load_excel_returns_bundle_for_weekly_raw(client, weekly_bytes):
    """response_model(ExcelReportBundle) 검증까지 통과해야 200 이 나온다."""
    res = _upload(client, "/api/marketing/load-excel", weekly_bytes, "Weekly Report.xlsb")
    assert res.status_code == 200, res.text

    body = res.json()
    assert body["periods"] == ["26년 7월", "26년 8월"]

    august = next(r for r in body["reports"] if r["period"] == "26년 8월")
    assert set(august["media"]) == {"네이버SA", "네이버BS", "구글DA"}
    assert august["budget_table"] == []
    assert {r["label"] for r in august["sa_total"]["rows"]} == {"전년", "전월", "당월", "YOY", "MOM"}


def test_load_excel_period_filter(client, weekly_bytes):
    res = _upload(client, "/api/marketing/load-excel", weekly_bytes,
                  "Weekly Report.xlsb", period="26년 8월")
    assert res.status_code == 200, res.text
    assert res.json()["periods"] == ["26년 8월"]


def test_load_excel_unknown_period_is_422(client, weekly_bytes):
    res = _upload(client, "/api/marketing/load-excel", weekly_bytes,
                  "Weekly Report.xlsb", period="26년 3월")
    assert res.status_code == 422
    assert "26년 3월" in res.json()["detail"]


def test_load_excel_keeps_conversion_only_rows(client, weekly_bytes):
    """노출·클릭이 0 인 전환 행이 HTTP 응답까지 살아 있어야 한다.

    실제 파일에서는 이런 행에 매출의 98.8% 가 들어 있다 — 어딘가에서 빈 행으로
    걸러지면 조용히 매출이 사라진다.
    """
    res = _upload(client, "/api/marketing/load-excel", weekly_bytes,
                  "Weekly Report.xlsb", period="26년 8월")
    august = res.json()["reports"][0]

    headers = august["media"]["네이버BS"]["headers"]
    row = august["media"]["네이버BS"]["daily"][0]
    cell = dict(zip(headers, row))

    assert cell["노출"] == 0 and cell["클릭"] == 0
    assert cell["구매매출액"] == 511_100
    assert cell["총전환수"] == 7
