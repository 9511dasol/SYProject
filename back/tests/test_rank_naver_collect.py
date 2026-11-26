"""네이버 API 자동 수집(M2) — 서명·응답 해석·캐시 동작의 약속을 고정한다.

네트워크는 쓰지 않는다. 실제 API 로 확인한 응답 모양을 가짜 클라이언트로 재현한다
(디바이스 라벨 "PC"/"모바일", breakdowns 배열, 통계가 없는 키워드는 행 자체가 없음).
"""

import base64
import hashlib
import hmac
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.models.user_model import User
from app.services.rank.base import RankProviderError
from app.core.settings import settings
from app.services.rank.collector import collect_ranks
from app.services.rank.naver_client import (
    ERR_AUTH,
    ERR_KEYWORD_NOT_FOUND,
    ERR_PROVIDER_DOWN,
    ERR_QUOTA,
    NaverSearchAdClient,
    _classify,
)
from app.services.rank.naver_provider import NaverRankProvider

TARGET = date(2026, 11, 21)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    RankAlertLog.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


class FakeClient:
    """실제 응답 모양을 흉내 낸다. 호출 횟수를 세어 캐시 동작을 확인한다."""

    def __init__(self, *, stats_rows=None, fail=None):
        self.index_calls = 0       # build_keyword_index 가 계정을 훑은 횟수
        self.stats_calls = 0
        self.last_breakdown = None
        self._stats_rows = stats_rows if stats_rows is not None else []
        self._fail = fail

    is_configured = True

    def campaigns(self):
        if self._fail:
            raise self._fail
        self.index_calls += 1
        return [{"nccCampaignId": "cmp-1", "name": "PC_테스트", "userLock": False}]

    def adgroups(self, campaign_id):
        return [{"nccAdgroupId": "grp-1", "userLock": False}]

    def keywords(self, adgroup_id):
        return [
            {"nccKeywordId": "nkw-1", "keyword": "마케팅자동화"},
            {"nccKeywordId": "nkw-2", "keyword": "마케팅 자동화"},  # 띄어쓰기 변형
            {"nccKeywordId": "nkw-3", "keyword": "리포트자동화"},
        ]

    def stats(self, ids, fields, since, until, breakdown=None):
        if self._fail:
            raise self._fail
        self.stats_calls += 1
        self.last_breakdown = breakdown
        return [r for r in self._stats_rows if r["id"] in ids]


def _watch(db, keyword="마케팅자동화", **kwargs):
    defaults = dict(
        keyword=keyword, device="all", target_rank=3.0, tolerance=0.5,
        breaches_required=1, cooldown_hours=24, alert_on_no_impression=True,
        status="active",
    )
    defaults.update(kwargs)
    watch = KeywordWatch(company_id=1, **defaults)
    db.add(watch)
    db.commit()
    return watch


def _provider(client):
    return NaverRankProvider(client=client)


# ── 서명 · 오류 분류 ──────────────────────────────────────────────────────────


def test_signature_uses_path_without_query():
    """쿼리스트링을 서명에 넣으면 인증이 깨진다 — 경로만 써야 한다."""
    client = NaverSearchAdClient(api_key="k", secret_key="s", customer_id="1")
    headers = client._headers("GET", "/stats")

    expected = base64.b64encode(
        hmac.new(
            b"s", f"{headers['X-Timestamp']}.GET./stats".encode(), hashlib.sha256
        ).digest()
    ).decode()
    assert headers["X-Signature"] == expected
    assert headers["X-API-KEY"] == "k"
    assert headers["X-Customer"] == "1"


def test_missing_credentials_is_reported_not_crashed():
    client = NaverSearchAdClient(api_key="", secret_key="", customer_id="")
    assert client.is_configured is False
    with pytest.raises(RankProviderError) as exc:
        client.get("/ncc/campaigns")
    assert exc.value.code == "NOT_CONFIGURED"


@pytest.mark.parametrize(
    "status,expected",
    [(401, ERR_AUTH), (403, ERR_AUTH), (429, ERR_QUOTA), (500, ERR_PROVIDER_DOWN),
     (503, ERR_PROVIDER_DOWN), (400, "BAD_REQUEST"), (404, "NOT_FOUND")],
)
def test_http_status_maps_to_actionable_code(status, expected):
    """실패를 '오류' 하나로 뭉뚱그리면 사용자가 할 일을 알 수 없다."""
    assert _classify(status) == expected


# ── 응답 해석 ─────────────────────────────────────────────────────────────────


def test_breakdown_rows_become_per_device_observations():
    rows = [{
        "id": "nkw-1", "impCnt": 10, "clkCnt": 1, "avgRnk": 2.0,
        "breakdowns": [
            {"name": "PC", "impCnt": 4, "clkCnt": 0, "avgRnk": 1.0},
            {"name": "모바일", "impCnt": 6, "clkCnt": 1, "avgRnk": 3.0},
        ],
    }]
    obs = _provider(FakeClient(stats_rows=rows)).observations_for(
        {"마케팅자동화": ["nkw-1"]}, TARGET
    )
    by_device = {o.device: o for o in obs}
    assert by_device["pc"].avg_rank == 1.0 and by_device["pc"].impressions == 4
    assert by_device["mobile"].avg_rank == 3.0 and by_device["mobile"].clicks == 1


def test_multiple_ids_merge_by_impression_weight():
    """같은 키워드가 여러 광고그룹에 있으면 노출수로 가중 평균한다."""
    rows = [
        {"id": "nkw-1", "impCnt": 100, "clkCnt": 5, "avgRnk": 2.0},
        {"id": "nkw-2", "impCnt": 300, "clkCnt": 15, "avgRnk": 4.0},
    ]
    obs = _provider(FakeClient(stats_rows=rows)).observations_for(
        {"마케팅자동화": ["nkw-1", "nkw-2"]}, TARGET
    )
    assert len(obs) == 1
    assert obs[0].avg_rank == pytest.approx(3.5)   # (2*100 + 4*300) / 400
    assert obs[0].impressions == 400 and obs[0].clicks == 20


def test_keyword_without_stats_row_is_recorded_as_no_impression():
    """콕 집어 물어봤는데 답이 없으면 '노출 0'이 확정이다 — 기록을 남겨야
    '노출 없음도 이탈로 본다' 설정이 동작한다."""
    obs = _provider(FakeClient(stats_rows=[])).observations_for(
        {"마케팅자동화": ["nkw-1"]}, TARGET
    )
    assert len(obs) == 1
    assert obs[0].avg_rank is None and obs[0].impressions == 0


def test_zero_rank_is_treated_as_no_exposure():
    rows = [{"id": "nkw-1", "impCnt": 0, "clkCnt": 0, "avgRnk": 0}]
    obs = _provider(FakeClient(stats_rows=rows)).observations_for(
        {"마케팅자동화": ["nkw-1"]}, TARGET
    )
    assert obs[0].avg_rank is None      # 0위는 1위보다 좋은 순위가 아니다


def test_old_dates_skip_device_breakdown():
    """상세 데이터는 최근 7일 이내만 허용된다 — 그보다 과거는 합산으로 받는다."""
    client = FakeClient(stats_rows=[])
    provider = _provider(client)

    provider.fetch_for_ids(["nkw-1"], date.today() - timedelta(days=1))
    assert client.last_breakdown == "pcMblTp"

    provider.fetch_for_ids(["nkw-1"], date.today() - timedelta(days=30))
    assert client.last_breakdown is None


def test_rejected_breakdown_falls_back_to_combined():
    """허용 창의 실제 판정은 매체 응답이다 — 날짜 계산이 낡아도 수집은 멈추지 않는다.

    분리 조회가 거부되면(11004) 그 자리에서 합산으로 전환하고, 남은 청크도
    분리를 다시 시도하지 않는다(똑같이 거부될 호출을 반복하지 않는다).
    """

    class WindowChangedClient(FakeClient):
        """매체가 분리 허용 창을 조인 상황 — breakdown 요청은 전부 거부한다."""

        def stats(self, ids, fields, since, until, breakdown=None):
            if breakdown is not None:
                self.stats_calls += 1
                raise RankProviderError("BAD_REQUEST", "상세 데이터는 최근 7일 이내 기간에서만 사용 가능합니다.")
            return super().stats(ids, fields, since, until, breakdown)

    rows = [
        {"id": "nkw-1", "impCnt": 10, "clkCnt": 1, "avgRnk": 2.0},
        {"id": "nkw-2", "impCnt": 20, "clkCnt": 2, "avgRnk": 3.0},
    ]
    client = WindowChangedClient(stats_rows=rows)
    # 청크를 1로 좁혀 "두 번째 청크는 분리를 시도조차 안 한다"까지 확인한다.
    original = settings.NAVER_STATS_CHUNK
    settings.NAVER_STATS_CHUNK = 1
    try:
        result = _provider(client).fetch_for_ids(
            ["nkw-1", "nkw-2"], date.today() - timedelta(days=1)
        )
    finally:
        settings.NAVER_STATS_CHUNK = original

    assert set(result) == {"nkw-1", "nkw-2"}          # 수집은 끝까지 간다
    assert result["nkw-1"][0]["device"] == "all"       # 분리 대신 합산으로
    breakdown_attempts = client.stats_calls - 2        # 합산 성공 2회를 뺀 나머지
    assert breakdown_attempts == 1                     # 거부는 한 번만 겪는다


def test_non_breakdown_errors_still_propagate():
    """폴백은 '분리 거부'에만 적용된다 — 인증 실패까지 삼키면 원인이 사라진다."""
    client = FakeClient(fail=RankProviderError(ERR_AUTH, "인증 실패"))
    with pytest.raises(RankProviderError) as exc:
        _provider(client).fetch_for_ids(["nkw-1"], date.today() - timedelta(days=1))
    assert exc.value.code == ERR_AUTH


def test_keyword_index_groups_spacing_variants():
    index = _provider(FakeClient()).build_keyword_index()
    assert sorted(index["마케팅자동화"]) == ["nkw-1", "nkw-2"]   # 띄어쓰기 변형이 합쳐진다
    assert index["리포트자동화"] == ["nkw-3"]


# ── 수집 흐름 ─────────────────────────────────────────────────────────────────


def test_collect_resolves_ids_and_ingests(db):
    _watch(db, "마케팅자동화")
    rows = [{"id": "nkw-1", "impCnt": 10, "clkCnt": 1, "avgRnk": 5.0}]
    client = FakeClient(stats_rows=rows)

    result = collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()

    assert result.resolved == 1 and result.collected == 1
    snap = db.query(KeywordRankSnapshot).one()
    assert snap.source == "api" and snap.avg_rank == 5.0
    watch = db.query(KeywordWatch).one()
    assert sorted(watch.nv_keyword_ids) == ["nkw-1", "nkw-2"]
    assert watch.breach_streak == 1     # 5.0 > 3.0+0.5


def test_second_run_uses_cached_ids(db):
    _watch(db, "마케팅자동화")
    client = FakeClient(stats_rows=[{"id": "nkw-1", "impCnt": 1, "clkCnt": 0, "avgRnk": 2.0}])

    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()
    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()

    assert client.index_calls == 1      # 계정을 두 번 훑지 않는다


def test_keyword_missing_from_account_does_not_trigger_reindex(db):
    """오타 하나 때문에 매일 계정 전체(광고그룹 수백 개)를 훑으면 안 된다.

    빈 목록은 '아직 안 찾아봄'이 아니라 '찾아봤지만 없었다'는 결론이다.
    """
    _watch(db, "계정에없는키워드")
    client = FakeClient(stats_rows=[])

    first = collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()
    assert first.not_found == ["계정에없는키워드"]
    watch = db.query(KeywordWatch).one()
    assert watch.nv_keyword_ids == []
    assert watch.last_error_code == ERR_KEYWORD_NOT_FOUND

    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()
    assert client.index_calls == 1      # 재색인이 반복되지 않는다


def test_stale_cache_is_refreshed(db):
    watch = _watch(db, "마케팅자동화")
    client = FakeClient(stats_rows=[])
    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()

    watch.nv_synced_at = datetime.now(timezone.utc) - timedelta(
        days=settings.RANK_ID_CACHE_DAYS + 1
    )
    db.commit()
    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()

    assert client.index_calls == 2      # 오래된 캐시는 다시 찾는다


def test_force_resolve_rebuilds_index(db):
    _watch(db, "마케팅자동화")
    client = FakeClient(stats_rows=[])
    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()
    collect_ranks(db, target_date=TARGET, provider=_provider(client), force_resolve=True)
    db.commit()

    assert client.index_calls == 2


def test_paused_watch_is_not_collected(db):
    _watch(db, "마케팅자동화", status="paused")
    client = FakeClient(stats_rows=[{"id": "nkw-1", "impCnt": 1, "clkCnt": 0, "avgRnk": 2.0}])

    result = collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()

    assert result.skipped_reason is not None
    assert db.query(KeywordRankSnapshot).count() == 0


def test_api_failure_records_error_code_and_keeps_data(db):
    _watch(db, "마케팅자동화")
    failing = FakeClient(fail=RankProviderError(ERR_AUTH, "인증 실패"))

    result = collect_ranks(db, target_date=TARGET, provider=_provider(failing))
    db.commit()

    assert result.collected == 0
    assert result.skipped_reason == "인증 실패"
    watch = db.query(KeywordWatch).one()
    assert watch.last_error_code == ERR_AUTH
    assert db.query(KeywordRankSnapshot).count() == 0   # 반쪽짜리 데이터를 남기지 않는다


def test_successful_collect_clears_previous_error(db):
    watch = _watch(db, "마케팅자동화", last_error_code=ERR_AUTH)
    client = FakeClient(stats_rows=[{"id": "nkw-1", "impCnt": 1, "clkCnt": 0, "avgRnk": 2.0}])

    collect_ranks(db, target_date=TARGET, provider=_provider(client))
    db.commit()

    assert watch.last_error_code is None


def test_unconfigured_provider_is_skipped_not_failed(db):
    _watch(db, "마케팅자동화")

    class Unconfigured(FakeClient):
        is_configured = False

    result = collect_ranks(db, target_date=TARGET, provider=_provider(Unconfigured()))
    assert result.collected == 0
    assert "API 키" in (result.skipped_reason or "")
