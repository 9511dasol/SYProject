"""업서트가 도중에 실패해도 이미 저장된 데이터가 남아 있어야 한다.

예전 _upsert 는 (1) 기존 행 DELETE 를 먼저 커밋하고 (2) INSERT 를 별도
트랜잭션으로 돌린 뒤 (3) 마지막에 되돌리기 스냅샷을 저장했다. 그래서 INSERT 가
끝내 실패하면 기존 행은 이미 지워졌는데 되돌릴 스냅샷도 아직 없어, 한 달치
성과 데이터가 복구 불가능하게 사라질 수 있었다.

지금은 읽기 → 스냅샷 저장 → (삭제+삽입) 순서로 돌고, 쓰기가 실패하면 스냅샷으로
되돌린다. 여기서는 INSERT 를 강제로 실패시켜 그 두 가지를 확인한다.
"""

import pandas as pd
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.company_model import Company
from app.models.marketing_model import MarketingData
from app.repositories import marketing_repo
from app.repositories.marketing_repo import MarketingRepository

EXISTING = {
    "company_id": 1,
    "report_date": "2026-07-01",
    "campaign_type": "구글SA",
    "impressions": 951,
    "clicks": 685,
    "cost": 69_783.48,
    "conversions": 72,
    "conversion_revenue": 19_249_337.62,
    "signup": 5.5,
    "purchase": 65.3,
    "apply": 1.08,
}


@pytest.fixture
def sqlite_engine(monkeypatch):
    """marketing_repo 의 engine 을 SQLite 로 갈아 끼운다.

    스냅샷은 실제로 저장돼야 복구 경로를 볼 수 있으므로, 끄지 않고 메모리
    리스트에 받아 둔다(실 구현은 별도 세션 SessionLocal 을 쓴다).
    """
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    # marketing_data.company_id 의 FK 가 companies 를 참조하므로 먼저 만든다.
    Company.__table__.create(engine)
    MarketingData.__table__.create(engine)
    monkeypatch.setattr(marketing_repo, "engine", engine)

    saved: dict[str, list[dict]] = {}
    monkeypatch.setattr(
        marketing_repo, "_save_undo_snapshot", lambda undo_id, rows, company_id: saved.__setitem__(undo_id, rows)
    )
    engine.snapshots = saved  # 테스트에서 들여다보려고 붙여 둔다
    try:
        yield engine
    finally:
        engine.dispose()


def _seed(engine) -> None:
    pd.DataFrame([EXISTING]).to_sql("marketing_data", con=engine, if_exists="append", index=False)


def _rows(engine) -> list[dict]:
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "SELECT impressions, clicks, cost, conversions, conversion_revenue, "
                "signup, purchase, apply FROM marketing_data "
                "WHERE report_date = :d AND campaign_type = :c"
            ),
            {"d": EXISTING["report_date"], "c": EXISTING["campaign_type"]},
        ).fetchall()
    return [dict(r._mapping) for r in result]


def _save_overwriting_the_seed() -> None:
    """같은 (날짜, 매체) 를 덮어쓰는 업서트 — 기존 행을 지우고 새 행을 넣는다."""
    daily = pd.DataFrame([{
        "date": EXISTING["report_date"],
        "impressions": 1, "clicks": 1, "cost": 1.0,
        "total_conv": 1, "revenue": 1.0, "signup": 1.0, "purchase": 1.0, "apply": 1.0,
    }])
    MarketingRepository(None, 1).save_from_kpis({EXISTING["campaign_type"]: daily})


def test_failed_insert_leaves_the_existing_rows_intact(sqlite_engine, monkeypatch):
    """새로 들어오는 행의 INSERT 가 실패하면 기존 행이 되살아나야 한다.

    들어온 데이터가 잘못돼 INSERT 가 깨지는 실제 상황을 재현한다 — 새 행
    (impressions=1)만 거부하고, 복구용 재삽입은 통과시킨다.
    """
    _seed(sqlite_engine)
    real_insert = marketing_repo._insert_chunk

    def _reject_new_rows(df_chunk):
        if 951 not in set(df_chunk["impressions"]):
            raise RuntimeError("INSERT 실패 재현")
        return real_insert(df_chunk)

    monkeypatch.setattr(marketing_repo, "_insert_chunk", _reject_new_rows)

    with pytest.raises(RuntimeError):
        _save_overwriting_the_seed()

    rows = _rows(sqlite_engine)
    assert len(rows) == 1, "기존 행이 사라졌다 — 복구에 실패했다"
    assert rows[0]["impressions"] == 951
    assert rows[0]["cost"] == pytest.approx(69_783.48)
    assert rows[0]["purchase"] == pytest.approx(65.3)


def test_snapshot_is_saved_before_anything_is_deleted(sqlite_engine, monkeypatch):
    """INSERT 가 실패해도 되돌리기 스냅샷은 이미 저장돼 있어야 한다.

    복구까지 실패하는 최악의 경우에 남는 유일한 복구 수단이다.
    """
    _seed(sqlite_engine)
    monkeypatch.setattr(
        marketing_repo, "_insert_chunk", lambda df_chunk: (_ for _ in ()).throw(RuntimeError("실패"))
    )

    with pytest.raises(RuntimeError):
        _save_overwriting_the_seed()

    snapshots = sqlite_engine.snapshots
    assert len(snapshots) == 1
    rows = next(iter(snapshots.values()))
    assert len(rows) == 1
    assert rows[0]["impressions"] == 951


def test_failed_insert_of_brand_new_data_leaves_no_orphan_rows(sqlite_engine, monkeypatch):
    """되돌릴 기존 행이 없는 신규 업로드가 깨져도 먼저 들어간 청크가 남으면 안 된다.

    청크 INSERT 는 앞 청크가 커밋된 뒤 뒤 청크가 깨질 수 있다. 이때 복구 범위를
    '스냅샷이 덮는 범위'로만 잡으면, 되돌릴 행이 아예 없는 신규 조합의 행은
    아무도 지우지 않아 반쪽짜리 데이터가 DB 에 남는다.
    """
    real_insert = marketing_repo._insert_chunk

    def _commit_first_row_then_fail(df_chunk):
        # 앞 청크는 커밋되고 뒤 청크에서 깨지는 상황을 그대로 만든다
        real_insert(df_chunk.iloc[:1])
        raise RuntimeError("뒤 청크 실패")

    monkeypatch.setattr(marketing_repo, "_insert_chunk", _commit_first_row_then_fail)

    daily = pd.DataFrame([
        {"date": "2026-07-01", "impressions": 10, "clicks": 1, "cost": 1.0,
         "total_conv": 0, "revenue": 0.0, "signup": 0.0, "purchase": 0.0, "apply": 0.0},
        {"date": "2026-07-02", "impressions": 20, "clicks": 2, "cost": 2.0,
         "total_conv": 0, "revenue": 0.0, "signup": 0.0, "purchase": 0.0, "apply": 0.0},
    ])

    with pytest.raises(RuntimeError):
        MarketingRepository(None, 1).save_from_kpis({"구글SA": daily})

    with sqlite_engine.begin() as conn:
        remaining = conn.execute(text("SELECT COUNT(*) FROM marketing_data")).scalar()
    assert remaining == 0, f"실패한 업로드의 행 {remaining}건이 DB 에 남았다"


def test_period_snapshot_round_trips(sqlite_engine, monkeypatch):
    """기간 통째 삭제 전 스냅샷 → 삭제 → 복구가 원래 값을 그대로 되돌리는가.

    엑셀 '덮어쓰기' 경로는 기간 전체를 먼저 지우고 커밋한 뒤 저장한다. 저장이
    실패하면 한 달치가 통째로 사라지므로, 지우기 전 스냅샷으로 되돌릴 수 있어야 한다.
    """
    _seed(sqlite_engine)

    saved: dict[str, list[dict]] = {}
    monkeypatch.setattr(
        marketing_repo, "_save_undo_snapshot", lambda undo_id, rows, company_id: saved.__setitem__(undo_id, rows)
    )

    session = sessionmaker(bind=sqlite_engine)()
    try:
        repo = MarketingRepository(session, 1)
        undo_id, snapshot = repo.snapshot_periods([(2026, 7)])
        assert len(snapshot) == 1, "삭제 전 스냅샷이 기존 행을 담지 못했다"
        assert snapshot[0]["impressions"] == 951
        assert undo_id in saved, "수동 복구용 스냅샷이 DB에 남지 않았다"

        assert repo.delete_rows_by_period(2026, 7) == 1
        session.commit()
    finally:
        session.close()

    assert _rows(sqlite_engine) == [], "삭제가 반영되지 않아 테스트가 무의미하다"

    marketing_repo.restore_rows(snapshot, company_id=1)

    rows = _rows(sqlite_engine)
    assert len(rows) == 1
    assert rows[0]["impressions"] == 951
    assert rows[0]["cost"] == pytest.approx(69_783.48)
    assert rows[0]["purchase"] == pytest.approx(65.3)
    assert rows[0]["conversion_revenue"] == pytest.approx(19_249_337.62)


def test_successful_upsert_still_overwrites(sqlite_engine):
    """복구 경로를 넣었다고 정상 덮어쓰기가 막히면 안 된다."""
    _seed(sqlite_engine)

    _save_overwriting_the_seed()

    rows = _rows(sqlite_engine)
    assert len(rows) == 1
    assert rows[0]["impressions"] == 1
    assert rows[0]["cost"] == pytest.approx(1.0)
