"""순위 모니터링 판정·적재 — 이 기능의 약속을 고정한다.

- 이탈 판정은 허용 오차를 넘어야 참이고, 노출 없음은 설정에 따라 이탈이다.
- 연속 이탈은 이력에서 재계산한다 — 같은 날짜를 다시 올려도 숫자가 불어나지 않는다.
- 일시정지된 감시는 기록은 남되 판정은 멈춘다.
"""

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.user_model import User  # keyword_watch.created_by 가 users 를 참조한다
from app.services.rank.base import RankObservation
from app.services.rank_monitor_service import (
    compute_streak,
    ingest_observations,
    is_breached,
)

D0 = date(2026, 11, 17)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    # users 를 먼저 만든다 — keyword_watch 의 FK 가 가리키는 테이블이라
    # 없으면 이 모듈만 단독 실행할 때 DDL 생성이 실패한다.
    User.__table__.create(engine)
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _watch(db, keyword="마케팅자동화", **kwargs) -> KeywordWatch:
    defaults = dict(
        keyword=keyword, device="all", target_rank=3.0, tolerance=0.5,
        breaches_required=2, alert_on_no_impression=True, status="active",
    )
    defaults.update(kwargs)
    watch = KeywordWatch(**defaults)
    db.add(watch)
    db.commit()
    return watch


def _obs(keyword="마케팅자동화", device="all", stat_date=D0, avg_rank=2.0, imp=100, clk=5):
    return RankObservation(
        keyword=keyword, device=device, stat_date=stat_date,
        avg_rank=avg_rank, impressions=imp, clicks=clk,
    )


# ── 이탈 판정 ──────────────────────────────────────────────────────────────────


def test_breach_requires_exceeding_tolerance(db):
    watch = _watch(db, target_rank=3.0, tolerance=0.5)
    assert not is_breached(watch, 3.0, 100)   # 목표 달성
    assert not is_breached(watch, 3.5, 100)   # 허용 오차 경계는 이탈 아님
    assert is_breached(watch, 3.6, 100)       # 경계를 넘어야 이탈


def test_no_impression_follows_setting(db):
    on = _watch(db, keyword="켬", alert_on_no_impression=True)
    off = _watch(db, keyword="끔", alert_on_no_impression=False)
    assert is_breached(on, None, 0)
    assert is_breached(on, 2.0, 0)        # 순위가 있어도 노출 0이면 노출 없음으로 본다
    assert not is_breached(off, None, 0)


def test_streak_counts_consecutive_from_latest(db):
    watch = _watch(db)
    # 최신부터: 이탈, 이탈, 정상, 이탈 → 연속 2
    snaps = [
        KeywordRankSnapshot(watch_id=1, stat_date=D0, avg_rank=5.0, impressions=100),
        KeywordRankSnapshot(watch_id=1, stat_date=D0 - timedelta(days=1), avg_rank=4.0, impressions=100),
        KeywordRankSnapshot(watch_id=1, stat_date=D0 - timedelta(days=2), avg_rank=2.0, impressions=100),
        KeywordRankSnapshot(watch_id=1, stat_date=D0 - timedelta(days=3), avg_rank=9.0, impressions=100),
    ]
    assert compute_streak(watch, snaps) == 2


# ── 적재 ──────────────────────────────────────────────────────────────────────


def test_ingest_creates_snapshot_and_updates_streak(db):
    watch = _watch(db, target_rank=3.0, tolerance=0.5)
    summary = ingest_observations(db, [_obs(avg_rank=5.0)], stat_date=D0)
    db.commit()

    assert summary.matched_watches == 1
    assert summary.inserted == 1
    snap = db.query(KeywordRankSnapshot).one()
    assert snap.watch_id == watch.id
    assert snap.avg_rank == 5.0
    assert watch.breach_streak == 1
    assert watch.last_checked_at is not None


def test_reingest_same_date_is_idempotent(db):
    watch = _watch(db)
    ingest_observations(db, [_obs(avg_rank=5.0)], stat_date=D0)
    db.commit()
    summary = ingest_observations(db, [_obs(avg_rank=6.0, imp=200)], stat_date=D0)
    db.commit()

    assert summary.updated == 1 and summary.inserted == 0
    snaps = db.query(KeywordRankSnapshot).all()
    assert len(snaps) == 1            # 새 행이 아니라 갱신
    assert snaps[0].avg_rank == 6.0
    assert watch.breach_streak == 1   # 재업로드로 연속 횟수가 불어나지 않는다


def test_streak_accumulates_across_days_and_resets(db):
    watch = _watch(db, breaches_required=2)
    ingest_observations(db, [_obs(stat_date=D0, avg_rank=5.0)], stat_date=D0)
    d1 = D0 + timedelta(days=1)
    ingest_observations(db, [_obs(stat_date=d1, avg_rank=6.0)], stat_date=d1)
    db.commit()
    assert watch.breach_streak == 2   # 이틀 연속 이탈

    d2 = D0 + timedelta(days=2)
    ingest_observations(db, [_obs(stat_date=d2, avg_rank=1.5)], stat_date=d2)
    db.commit()
    assert watch.breach_streak == 0   # 목표 복귀로 리셋


def test_device_watch_prefers_matching_rows(db):
    _watch(db, device="pc")
    rows = [
        _obs(device="pc", avg_rank=2.0, imp=100),
        _obs(device="mobile", avg_rank=9.0, imp=900),
    ]
    ingest_observations(db, rows, stat_date=D0)
    db.commit()
    snap = db.query(KeywordRankSnapshot).one()
    assert snap.avg_rank == 2.0       # 모바일 행은 섞이지 않는다
    assert snap.impressions == 100


def test_device_watch_falls_back_to_undivided_rows(db):
    # 보고서에 디바이스 컬럼이 없으면 행이 "all"로 온다 — 없는 것보단 낫다.
    _watch(db, device="pc")
    ingest_observations(db, [_obs(device="all", avg_rank=3.0)], stat_date=D0)
    db.commit()
    assert db.query(KeywordRankSnapshot).count() == 1


def test_all_watch_merges_devices_weighted(db):
    _watch(db, device="all")
    rows = [
        _obs(device="pc", avg_rank=1.8, imp=100, clk=5),
        _obs(device="mobile", avg_rank=3.0, imp=900, clk=45),
    ]
    ingest_observations(db, rows, stat_date=D0)
    db.commit()
    snap = db.query(KeywordRankSnapshot).one()
    assert snap.avg_rank == pytest.approx(2.88)  # (1.8*100 + 3.0*900) / 1000
    assert snap.impressions == 1000
    assert snap.clicks == 50


def test_paused_watch_records_but_keeps_streak_frozen(db):
    watch = _watch(db, status="paused")
    watch.breach_streak = 3
    db.commit()
    ingest_observations(db, [_obs(avg_rank=1.0)], stat_date=D0)
    db.commit()
    assert db.query(KeywordRankSnapshot).count() == 1  # 기록은 남는다
    assert watch.breach_streak == 3                    # 판정은 멈춘다


def test_unmatched_and_missing_are_reported(db):
    _watch(db, keyword="감시중키워드")
    summary = ingest_observations(db, [_obs(keyword="처음보는키워드")], stat_date=D0)
    assert summary.unmatched_keywords == ["처음보는키워드"]
    assert summary.watches_no_data == ["감시중키워드"]
    assert summary.matched_watches == 0


def test_keyword_matching_ignores_spacing(db):
    _watch(db, keyword="마케팅 자동화")
    summary = ingest_observations(db, [_obs(keyword="마케팅자동화")], stat_date=D0)
    db.commit()
    assert summary.matched_watches == 1
