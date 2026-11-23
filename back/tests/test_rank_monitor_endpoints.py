"""순위 모니터링 엔드포인트 — 등록(부분 성공)·목록·수정·삭제·업로드 적재·기능 플래그.

대량 등록은 일부가 중복이어도 전체를 거절하지 않고 행별 사유를 돌려준다는 약속,
삭제는 이력까지 함께 지운다는 약속, 플래그를 끄면 API 레벨에서 막힌다는 약속을 본다.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_current_user, get_db
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.models.system_setting_model import SystemSetting
from app.models.user_model import User
from app.routers import rank_monitor_router

CSV = (
    "키워드,노출수,클릭수,평균노출순위\n"
    "마케팅자동화,1000,50,5.0\n"
    "미등록키워드,10,1,2.0\n"
).encode("utf-8-sig")


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)  # keyword_watch 의 FK 대상
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    RankAlertLog.__table__.create(engine)
    SystemSetting.__table__.create(engine)  # 기능 플래그 의존성이 조회한다
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(rank_monitor_router.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, email="user@example.com", role="user"
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _create(client, keyword="마케팅자동화", **overrides):
    item = {"keyword": keyword, "target_rank": 3.0, "tolerance": 0.5, **overrides}
    res = client.post("/api/rank-monitor/watches", json={"items": [item]})
    assert res.status_code == 200, res.text
    return res.json()


def _upload(client, stat_date="2026-11-17", content=CSV):
    return client.post(
        "/api/rank-monitor/snapshots/upload",
        files={"file": ("report.csv", content, "text/csv")},
        data={"stat_date": stat_date},
    )


# ── 등록 ──────────────────────────────────────────────────────────────────────


def test_bulk_create_reports_per_row_results(client):
    res = client.post(
        "/api/rank-monitor/watches",
        json={"items": [
            {"keyword": "마케팅자동화"},
            {"keyword": "리포트자동화"},
            {"keyword": "마케팅자동화"},  # 같은 요청 안의 중복
        ]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["created"] == 2
    assert body["skipped"] == 1
    statuses = [r["status"] for r in body["results"]]
    assert statuses == ["created", "created", "skipped"]
    assert body["results"][2]["reason"]           # 건너뛴 사유를 알려준다
    assert all(r["id"] for r in body["results"] if r["status"] == "created")


def test_duplicate_against_existing_is_skipped_not_failed(client):
    _create(client)
    body = _create(client)
    assert body["created"] == 0 and body["skipped"] == 1


def test_case_and_spacing_variants_count_as_duplicates(client, db):
    """'Nike' 와 'nike' 를 따로 등록하면 보고서 한 줄이 두 감시에 꽂혀 이력이 갈라진다."""
    res = client.post(
        "/api/rank-monitor/watches",
        json={"items": [{"keyword": "Nike"}, {"keyword": "nike"}, {"keyword": "ni ke"}]},
    )
    body = res.json()
    assert body["created"] == 1 and body["skipped"] == 2
    assert db.query(KeywordWatch).count() == 1


def test_cooldown_hours_is_persisted(client, db):
    """스키마가 받아 놓고 모델에 넣지 않아 조용히 기본값(24)이 되던 문제."""
    _create(client, cooldown_hours=1)
    assert db.query(KeywordWatch).one().cooldown_hours == 1
    assert client.get("/api/rank-monitor/watches").json()["items"][0]["cooldown_hours"] == 1


# ── 목록·수정·삭제 ─────────────────────────────────────────────────────────────


def test_list_includes_latest_snapshot_and_breach_state(client):
    _create(client, target_rank=3.0, breaches_required=1)
    assert _upload(client).status_code == 200

    res = client.get("/api/rank-monitor/watches")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    item = items[0]
    assert item["latest"]["avg_rank"] == 5.0
    assert item["breach_streak"] == 1
    assert item["is_breached"] is True       # 5.0 > 3.0+0.5, 기준 1회 도달


def test_patch_updates_only_sent_fields(client):
    watch_id = _create(client)["results"][0]["id"]
    res = client.patch(
        f"/api/rank-monitor/watches/{watch_id}",
        json={"target_rank": 1.0, "status": "paused"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["target_rank"] == 1.0
    assert body["status"] == "paused"
    assert body["tolerance"] == 0.5          # 안 보낸 필드는 그대로


def test_patching_target_rank_recomputes_breach_state(client):
    """목표를 고치면 상태도 같이 바뀌어야 한다 — 다음 업로드까지 기다리면 안 된다."""
    watch_id = _create(client, target_rank=10.0)["results"][0]["id"]
    _upload(client)                                   # 마케팅자동화 5.0위
    assert client.get("/api/rank-monitor/watches").json()["items"][0]["breach_streak"] == 0

    # 목표를 조이면 즉시 이탈로 잡힌다
    tightened = client.patch(
        f"/api/rank-monitor/watches/{watch_id}", json={"target_rank": 2.0}
    ).json()
    assert tightened["breach_streak"] == 1

    # 반대로 풀면 즉시 정상으로 돌아온다 — '하락' 뱃지가 눌어붙지 않는다
    relaxed = client.patch(
        f"/api/rank-monitor/watches/{watch_id}", json={"target_rank": 50.0}
    ).json()
    assert relaxed["breach_streak"] == 0 and relaxed["is_breached"] is False


def test_delete_removes_history_too(client, db):
    watch_id = _create(client)["results"][0]["id"]
    _upload(client)
    assert db.query(KeywordRankSnapshot).count() == 1

    res = client.delete(f"/api/rank-monitor/watches/{watch_id}")
    assert res.status_code == 200
    assert db.query(KeywordWatch).count() == 0
    assert db.query(KeywordRankSnapshot).count() == 0


def test_missing_watch_is_404(client):
    assert client.patch("/api/rank-monitor/watches/999", json={}).status_code == 404
    assert client.delete("/api/rank-monitor/watches/999").status_code == 404
    assert client.get("/api/rank-monitor/watches/999/history").status_code == 404


# ── 업로드 적재 ────────────────────────────────────────────────────────────────


def test_upload_matches_and_reports_unmatched(client):
    _create(client)
    res = _upload(client)
    assert res.status_code == 200
    body = res.json()
    assert body["matched_watches"] == 1
    assert body["inserted"] == 1
    assert body["unmatched_keywords"] == ["미등록키워드"]


def test_reupload_same_date_updates_instead_of_duplicating(client, db):
    _create(client)
    _upload(client)
    body = _upload(client).json()
    assert body["updated"] == 1 and body["inserted"] == 0
    assert db.query(KeywordRankSnapshot).count() == 1


def test_upload_rejects_wrong_format_with_reason(client):
    _create(client)
    res = _upload(client, content="키워드,노출수\n마케팅자동화,100\n".encode("utf-8-sig"))
    assert res.status_code == 422
    assert "평균노출순위" in res.json()["detail"]


def test_history_returns_snapshots_in_date_order(client):
    _create(client)
    _upload(client, stat_date="2026-11-16")
    _upload(client, stat_date="2026-11-17")

    watch_id = client.get("/api/rank-monitor/watches").json()["items"][0]["id"]
    res = client.get(f"/api/rank-monitor/watches/{watch_id}/history")
    assert res.status_code == 200
    dates = [item["stat_date"] for item in res.json()["items"]]
    assert dates == ["2026-11-16", "2026-11-17"]  # 그래프는 왼쪽이 과거


# ── 알림 (M3) ─────────────────────────────────────────────────────────────────


def test_upload_reports_alert_summary(client, monkeypatch):
    """적재 응답이 "알림이 나갔는지"를 함께 알려준다 — 수신자 미설정도 사유로 전달."""
    _create(client, breaches_required=1)   # 한 번만 이탈해도 하락
    res = _upload(client)
    assert res.status_code == 200
    alerts = res.json()["alerts"]
    assert alerts["drops"] == 1
    assert alerts["sent"] is False                 # 테스트 환경엔 수신자가 없다
    assert "수신자" in (alerts["skipped_reason"] or "")


def test_alert_failure_does_not_fail_the_upload(client, monkeypatch):
    """알림이 터져도 적재는 성공이다 — 데이터는 이미 저장됐다."""
    def boom(_db):
        raise RuntimeError("메일 서버 폭발")

    monkeypatch.setattr(rank_monitor_router, "run_rank_alerts", boom)
    _create(client, breaches_required=1)
    res = _upload(client)

    assert res.status_code == 200                  # 업로드는 성공
    assert res.json()["inserted"] == 1             # 데이터도 들어갔다
    assert "알림 평가 실패" in (res.json()["alerts"]["skipped_reason"] or "")


def test_alerts_endpoint_lists_history(client, db):
    watch_id = _create(client)["results"][0]["id"]
    db.add(RankAlertLog(
        watch_id=watch_id, keyword="마케팅자동화", device="all", alert_type="drop",
        target_rank=3.0, curr_rank=6.0, prev_rank=3.2, breach_streak=2,
        recipients="팀@example.com", status="sent",
    ))
    db.commit()

    res = client.get("/api/rank-monitor/alerts")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["alert_type"] == "drop"
    assert body["items"][0]["curr_rank"] == 6.0

    # 감시별 필터
    assert client.get(f"/api/rank-monitor/alerts?watch_id={watch_id}").json()["total"] == 1
    assert client.get("/api/rank-monitor/alerts?watch_id=999").json()["total"] == 0


def test_deleting_watch_keeps_alert_history(client, db):
    watch_id = _create(client)["results"][0]["id"]
    db.add(RankAlertLog(
        watch_id=watch_id, keyword="마케팅자동화", device="all", alert_type="drop",
        target_rank=3.0, curr_rank=6.0, prev_rank=3.2, breach_streak=2,
        recipients="팀@example.com", status="sent",
    ))
    db.commit()

    assert client.delete(f"/api/rank-monitor/watches/{watch_id}").status_code == 200

    log = db.query(RankAlertLog).one()
    assert log.watch_id is None        # 감시와의 연결만 끊긴다
    assert log.keyword == "마케팅자동화"  # 무엇에 대한 알림이었는지는 남는다


# ── 예상 입찰가 (M5) ──────────────────────────────────────────────────────────


def test_bid_estimate_returns_rows(client, monkeypatch):
    from app.services.rank import bid_estimate as be

    class FakeService:
        is_configured = True

        def __init__(self, *a, **k):
            pass

        def estimate(self, keyword, device="all", max_position=5):
            return be.BidEstimate(
                keyword=keyword,
                rows=[be.BidRow(position=1, pc=1610, mobile=2430),
                      be.BidRow(position=2, pc=1500, mobile=2030)],
            )

    monkeypatch.setattr(rank_monitor_router, "BidEstimateService", FakeService)
    watch_id = _create(client, target_rank=2.0)["results"][0]["id"]

    res = client.get(f"/api/rank-monitor/watches/{watch_id}/bid-estimate")
    assert res.status_code == 200
    body = res.json()
    assert body["keyword"] == "마케팅자동화" and body["target_rank"] == 2.0
    assert body["rows"][0] == {"position": 1, "pc": 1610, "mobile": 2430}
    assert body["skipped_reason"] is None


def test_bid_estimate_without_api_key_is_explained_not_failed(client, monkeypatch):
    class Unconfigured:
        is_configured = False

        def __init__(self, *a, **k):
            pass

    monkeypatch.setattr(rank_monitor_router, "BidEstimateService", Unconfigured)
    watch_id = _create(client)["results"][0]["id"]

    res = client.get(f"/api/rank-monitor/watches/{watch_id}/bid-estimate")
    assert res.status_code == 200          # 화면 전체를 깨뜨리지 않는다
    assert res.json()["rows"] == []
    assert "API 키" in res.json()["skipped_reason"]


def test_bid_estimate_missing_watch_is_404(client):
    assert client.get("/api/rank-monitor/watches/999/bid-estimate").status_code == 404


# ── 기능 플래그 ────────────────────────────────────────────────────────────────


def test_feature_flag_off_blocks_api(client, db):
    db.add(SystemSetting(key="is_rank_monitor_enabled", value="false"))
    db.commit()
    assert client.get("/api/rank-monitor/watches").status_code == 503
