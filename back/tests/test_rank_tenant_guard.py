"""테넌트 안전장치 — 서버 키 1벌을 소유 기업 밖으로 흘리지 않는다는 약속.

지금 네이버 광고 키는 환경변수 1벌이고 특정 기업의 광고 계정이다. 순위 모니터링
자체는 모든 기업이 쓰므로, 보호가 없으면 B기업이 "지금 수집"을 눌렀을 때 A기업
계정이 조회되고 그 결과가 B기업 화면에 뜬다. 여기서 고정하는 것은 두 가지다:

1. 소유 기업이 아니면 **외부 호출 자체가 일어나지 않는다** (안내만 돌려준다)
2. 소유 기업이 아니면 **알림 메일을 보내지 않는다** — 전역 수신자에게 남의 기업
   키워드가 나가는 것은 조회 유출보다 무겁다

업로드 경로(보고서 CSV)는 외부 호출이 없으므로 막지 않는다 — 이것도 함께 본다.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_current_user, get_db
from app.core.settings import settings
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.models.system_setting_model import SystemSetting
from app.models.user_model import User
from app.routers import rank_monitor_router
from app.services.rank import collector as collector_mod
from app.services.rank.alert_factory import NO_ALERT_RECIPIENT_MESSAGE, run_rank_alerts
from app.services.rank.collector import collect_ranks
from app.services.rank import report_section as report_section_mod
from app.services.rank.credentials import (
    NO_ACCESS_MESSAGE,
    has_naver_access,
    naver_scope_company_id,
    owns_global_alert_recipients,
)
from app.services.rank.report_section import build_rank_section

OWNER = 1       # settings.NAVER_CREDENTIAL_COMPANY_ID
OUTSIDER = 7    # 다른 기업 또는 체험 계정


@pytest.fixture
def configured(monkeypatch):
    """키가 설정된 운영 상태를 흉내 낸다 (가짜 값 — 네트워크는 쓰지 않는다)."""
    monkeypatch.setattr(settings, "NAVER_SEARCHAD_API_KEY", "k", raising=False)
    monkeypatch.setattr(settings, "NAVER_SEARCHAD_SECRET_KEY", "s", raising=False)
    monkeypatch.setattr(settings, "NAVER_SEARCHAD_CUSTOMER_ID", "41612", raising=False)
    monkeypatch.setattr(settings, "NAVER_CREDENTIAL_COMPANY_ID", OWNER, raising=False)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    RankAlertLog.__table__.create(engine)
    SystemSetting.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _client(db, company_id: int) -> TestClient:
    app = FastAPI()
    app.include_router(rank_monitor_router.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: User(
        id=company_id, email=f"u{company_id}@example.com", role="admin", company_id=company_id
    )
    return TestClient(app)


def _watch(db, company_id: int) -> KeywordWatch:
    watch = KeywordWatch(
        company_id=company_id,
        keyword="마케팅자동화",
        device="all",
        target_rank=3.0,
        tolerance=0.5,
        status="active",
    )
    db.add(watch)
    db.commit()
    return watch


# ── 판정 함수 ────────────────────────────────────────────────────────────────


def test_접근권한은_소유기업에만(configured):
    assert has_naver_access(OWNER) is True
    assert has_naver_access(OUTSIDER) is False
    # None 은 크론이 범위를 안 좁힌 경우다 — 통과시키면 전 기업을 소유 키로 돈다.
    assert has_naver_access(None) is False


def test_소유권판정은_키설정과_무관(monkeypatch):
    """두 사실을 섞으면 키 부재를 "남의 계정"으로 안내하고, 외부 API 와 무관한
    업로드 알림 경로까지 키에 묶인다 — 실제로 그렇게 끊어진 적이 있다."""
    monkeypatch.setattr(settings, "NAVER_SEARCHAD_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "NAVER_CREDENTIAL_COMPANY_ID", OWNER, raising=False)

    assert has_naver_access(OWNER) is True        # 소유권은 그대로
    assert naver_scope_company_id() is None       # 크론은 돌지 않는다


def test_키없으면_수집은_미설정안내(db, monkeypatch):
    """키 부재와 타 기업은 다른 상황이다 — 문구가 섞이면 원인을 못 찾는다."""
    monkeypatch.setattr(settings, "NAVER_SEARCHAD_API_KEY", "", raising=False)
    _watch(db, OWNER)

    reason = collect_ranks(db, company_id=OWNER).skipped_reason
    assert reason != NO_ACCESS_MESSAGE
    assert "API 키" in reason


def test_알림_수신자소유는_키설정과_무관(db, monkeypatch):
    """업로드만 쓰는 기업도 알림을 받아야 한다 — 네이버 키와 묶으면 끊긴다."""
    monkeypatch.setattr(settings, "NAVER_SEARCHAD_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "NAVER_CREDENTIAL_COMPANY_ID", OWNER, raising=False)

    assert owns_global_alert_recipients(OWNER) is True
    assert owns_global_alert_recipients(OUTSIDER) is False
    # 소유 기업은 평가까지 들어간다 — 수신자 미설정 사유로 막히더라도 "수신자 없음"이다.
    assert run_rank_alerts(db, OWNER).skipped_reason != NO_ALERT_RECIPIENT_MESSAGE


def test_설정되면_크론범위는_소유기업(configured):
    assert naver_scope_company_id() == OWNER


# ── 수집: 외부 호출이 일어나지 않는다 ────────────────────────────────────────


def test_타기업_수집은_외부호출없이_안내(configured, db, monkeypatch):
    """공급자 생성 자체가 막혀야 한다 — 생성되면 그 순간 남의 계정으로 간다."""

    def _boom(*args, **kwargs):
        raise AssertionError("타 기업 수집에서 네이버 공급자가 생성되었다")

    monkeypatch.setattr(collector_mod, "NaverRankProvider", _boom)
    _watch(db, OUTSIDER)

    result = collect_ranks(db, company_id=OUTSIDER)

    assert result.skipped_reason == NO_ACCESS_MESSAGE
    assert result.collected == 0


def test_company_id없는_수집도_차단(configured, db, monkeypatch):
    monkeypatch.setattr(
        collector_mod,
        "NaverRankProvider",
        lambda *a, **k: pytest.fail("범위 없는 수집이 외부 호출로 갔다"),
    )
    assert collect_ranks(db, company_id=None).skipped_reason == NO_ACCESS_MESSAGE


# ── 알림: 메일이 나가지 않는다 ───────────────────────────────────────────────


def test_타기업_알림은_평가도_발송도_안함(configured, db):
    """평가까지 돌면 alerted 로 소진돼, 나중에 기업별 수신자가 생겨도 영영 안 나간다."""
    result = run_rank_alerts(db, OUTSIDER)

    assert result.skipped_reason == NO_ALERT_RECIPIENT_MESSAGE
    assert result.sent == 0
    assert db.query(RankAlertLog).count() == 0


# ── 엔드포인트 ──────────────────────────────────────────────────────────────


def test_타기업_수집상태는_미연결로_보인다(configured, db):
    res = _client(db, OUTSIDER).get("/api/rank-monitor/collect/status")
    assert res.status_code == 200
    body = res.json()
    assert body["configured"] is False
    assert body["message"] == NO_ACCESS_MESSAGE


def test_소유기업_수집상태는_연결됨(configured, db):
    body = _client(db, OWNER).get("/api/rank-monitor/collect/status").json()
    assert body["configured"] is True


def test_타기업_입찰가_경쟁지표는_안내만(configured, db, monkeypatch):
    watch = _watch(db, OUTSIDER)
    client = _client(db, OUTSIDER)

    for path in ("bid-estimate", "insight"):
        res = client.get(f"/api/rank-monitor/watches/{watch.id}/{path}")
        assert res.status_code == 200, res.text
        assert res.json()["skipped_reason"] == NO_ACCESS_MESSAGE, path


# ── 리포트: 입찰가 조회도 새지 않는다 ───────────────────────────────────────


def test_타기업_리포트는_입찰가_API를_부르지_않는다(configured, db, monkeypatch):
    """감시는 기업별로 고르면서 입찰가만 서버 키로 조회하면, 남의 기업 리포트에
    **소유 기업 계정의 입찰가**가 박힌다 — 격리가 리포트 경로에서만 뚫린다."""
    monkeypatch.setattr(
        report_section_mod,
        "BidEstimateService",
        lambda *a, **k: pytest.fail("타 기업 리포트가 입찰가 API 로 갔다"),
    )
    watch = _watch(db, OUTSIDER)
    watch.breach_streak = watch.breaches_required
    db.commit()

    section = build_rank_section(db, company_id=OUTSIDER)

    # 구역 자체는 나간다 — 순위는 DB 에서 나오므로 막을 이유가 없다.
    assert section.breached_total == 1
    assert section.rows[0].keyword == watch.keyword
    assert section.rows[0].target_bid_pc is None


def test_소유기업_리포트는_입찰가까지_간다(configured, db, monkeypatch):
    """막는 것이 과하면 소유 기업 리포트에서 입찰가가 통째로 사라진다."""
    built: list[int] = []

    class _Estimator:
        is_configured = True
        rows = ()  # 입찰가는 안 붙되 행은 남는다 — 여기서 볼 것은 "불렀는가"뿐이다

        def __init__(self, *args, **kwargs):
            built.append(1)

        def estimate(self, *args, **kwargs):
            return self

    monkeypatch.setattr(report_section_mod, "BidEstimateService", _Estimator)
    watch = _watch(db, OWNER)
    watch.breach_streak = watch.breaches_required
    db.commit()

    build_rank_section(db, company_id=OWNER)

    assert built, "소유 기업은 입찰가 조회 경로를 타야 한다"


def test_타기업_업로드경로는_막지_않는다(configured, db):
    """외부 호출이 없는 경로다 — 안전장치가 기능을 통째로 막아선 안 된다."""
    watch = _watch(db, OUTSIDER)
    csv = "키워드,노출수,클릭수,평균노출순위\n마케팅자동화,1000,50,5.0\n".encode("utf-8-sig")

    res = _client(db, OUTSIDER).post(
        "/api/rank-monitor/snapshots/upload",
        files={"file": ("report.csv", csv, "text/csv")},
        data={"stat_date": "2026-11-17"},
    )

    assert res.status_code == 200, res.text
    assert res.json()["matched_watches"] == 1
    snap = db.query(KeywordRankSnapshot).filter_by(watch_id=watch.id).one()
    assert snap.avg_rank == pytest.approx(5.0)
