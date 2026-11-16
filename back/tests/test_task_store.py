"""백그라운드 작업 상태 저장소 — 업로드·엑셀 저장·내보내기가 모두 이 위에 올라간다.

화면이 3초마다 폴링하는 진행률, "취소" 버튼, 1회용 다운로드, TTL 정리가 전부 여기서
결정되는데 직접 테스트가 없었다. 인메모리 dict 에서 DB 로 옮긴 모듈이라 더더욱
"다른 인스턴스에서도 같은 상태가 보이는가"가 중요하다.

각 함수가 자체 세션을 여닫으므로, 테스트에서도 SessionLocal 만 sqlite 로 갈아 끼운다.
"""

from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.background_task_model import BackgroundTask
from app.models.undo_snapshot_model import UndoSnapshot
from app.services import task_store


@compiles(JSONB, "sqlite")
def _jsonb_as_json(type_, compiler, **kw):
    """sqlite 에는 JSONB 가 없다 — DDL 에서만 JSON 으로 떨어뜨린다."""
    return "JSON"


@pytest.fixture
def store(monkeypatch):
    engine = sa.create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    BackgroundTask.__table__.create(engine)
    UndoSnapshot.__table__.create(engine)

    Session = sessionmaker(bind=engine)
    # task_store 와 각 repo 가 모듈 전역 SessionLocal 을 직접 쓴다
    monkeypatch.setattr(task_store, "SessionLocal", Session)
    try:
        yield engine
    finally:
        engine.dispose()


# ── 생성·조회 ────────────────────────────────────────────────────────────────


def test_created_task_is_readable_afterwards(store):
    """다른 요청(=다른 세션)에서도 같은 상태가 보여야 한다 — DB 로 옮긴 이유."""
    task_id = task_store.create_task("marketing_upload", message="시작")

    task = task_store.get_task(task_id)
    assert task is not None
    assert (task["kind"], task["status"], task["message"]) == ("marketing_upload", "pending", "시작")
    assert task["progress"] == 0 and task["result"] == {}


def test_task_id_is_generated_when_not_given(store):
    first = task_store.create_task("generic")
    second = task_store.create_task("generic")
    assert first and second and first != second


def test_missing_task_returns_none(store):
    assert task_store.get_task("없는-id") is None


def test_kind_filter_prevents_reading_another_kind(store):
    """내보내기 폴링이 업로드 작업을 읽어 엉뚱한 진행률을 보여주면 안 된다."""
    task_id = task_store.create_task("marketing_upload")

    assert task_store.get_task(task_id, kind="marketing_upload") is not None
    assert task_store.get_task(task_id, kind="marketing_export") is None


# ── 갱신 ─────────────────────────────────────────────────────────────────────


def test_update_changes_only_what_is_given(store):
    task_id = task_store.create_task("generic", message="처음", progress=5)

    task_store.update_task(task_id, progress=50)

    task = task_store.get_task(task_id)
    assert task["progress"] == 50
    assert task["message"] == "처음"      # 건드리지 않은 칸은 그대로
    assert task["status"] == "pending"


def test_result_patch_merges_instead_of_replacing(store):
    """단계마다 결과를 조금씩 덧붙인다 — 앞서 넣은 값이 사라지면 안 된다."""
    task_id = task_store.create_task("marketing_export", result={"delivered_by": "download"})

    task_store.update_task(task_id, result_patch={"filename": "리포트.xlsx"})
    task_store.update_task(task_id, result_patch={"storage_path": "exports/a.xlsx"})

    assert task_store.get_task(task_id)["result"] == {
        "delivered_by": "download",
        "filename": "리포트.xlsx",
        "storage_path": "exports/a.xlsx",
    }


def test_updating_a_missing_task_is_a_no_op(store):
    """정리 잡이 이미 지운 작업에 워커가 진행률을 쓸 수 있다 — 터지면 안 된다."""
    task_store.update_task("없는-id", progress=10)  # 예외 없이 지나가야 한다


def test_error_is_recorded(store):
    task_id = task_store.create_task("generic")
    task_store.update_task(task_id, status="error", error="SMTP 인증 실패")

    task = task_store.get_task(task_id)
    assert task["status"] == "error" and task["error"] == "SMTP 인증 실패"


# ── 취소 ─────────────────────────────────────────────────────────────────────


def test_cancel_sets_the_flag_the_worker_polls(store):
    task_id = task_store.create_task("marketing_export", status="processing")

    assert task_store.is_cancelled(task_id) is False
    assert task_store.cancel_task(task_id) is True
    assert task_store.is_cancelled(task_id) is True
    assert task_store.get_task(task_id)["status"] == "cancelled"


def test_cancelling_a_missing_task_reports_failure(store):
    """라우터가 이 값으로 404 를 낸다."""
    assert task_store.cancel_task("없는-id") is False


@pytest.mark.parametrize("final_status", ["done", "error", "completed", "failed"])
def test_cancel_does_not_rewrite_a_finished_status(store, final_status):
    """이미 끝난 작업을 취소해도 결과가 '취소됨'으로 바뀌면 안 된다 — 완료는 사실이다."""
    task_id = task_store.create_task("generic", status=final_status)

    assert task_store.cancel_task(task_id) is True
    assert task_store.get_task(task_id)["status"] == final_status
    assert task_store.is_cancelled(task_id) is True


def test_is_cancelled_is_false_for_a_missing_task(store):
    assert task_store.is_cancelled("없는-id") is False


# ── 결과 바이너리 (1회용 다운로드) ───────────────────────────────────────────


def test_result_blob_round_trips(store):
    task_id = task_store.create_task("marketing_export")
    task_store.set_result_blob(task_id, b"PK\x03\x04excel")

    assert task_store.pop_result_blob(task_id) == b"PK\x03\x04excel"


def test_result_blob_can_only_be_taken_once(store):
    """내려준 뒤 비워야 같은 링크로 다시 받을 수 없다."""
    task_id = task_store.create_task("marketing_export")
    task_store.set_result_blob(task_id, b"data")

    assert task_store.pop_result_blob(task_id) == b"data"
    assert task_store.pop_result_blob(task_id) is None


def test_popping_a_blob_that_was_never_set_returns_none(store):
    task_id = task_store.create_task("marketing_export")
    assert task_store.pop_result_blob(task_id) is None


# ── 삭제·만료 정리 ───────────────────────────────────────────────────────────


def test_delete_removes_the_task(store):
    task_id = task_store.create_task("generic")
    task_store.delete_task(task_id)
    assert task_store.get_task(task_id) is None


def _age_task(engine, task_id: str, hours: int) -> None:
    with engine.begin() as conn:
        conn.execute(
            sa.text("UPDATE background_tasks SET created_at = :t WHERE id = :i"),
            {"t": datetime.now(timezone.utc) - timedelta(hours=hours), "i": task_id},
        )


def test_purge_removes_only_expired_tasks(store):
    fresh = task_store.create_task("generic")
    stale = task_store.create_task("generic")
    _age_task(store, stale, task_store.TASK_TTL_HOURS + 1)

    tasks, _ = task_store.purge_expired()

    assert tasks == 1
    assert task_store.get_task(stale) is None
    assert task_store.get_task(fresh) is not None


def test_purge_also_clears_expired_undo_snapshots(store):
    """되돌리기 스냅샷은 작업보다 훨씬 짧게(30분) 산다."""
    Session = task_store.SessionLocal
    db = Session()
    try:
        from app.repositories.undo_snapshot_repo import UndoSnapshotRepository

        UndoSnapshotRepository(db).create("old", [{"a": 1}])
        UndoSnapshotRepository(db).create("new", [{"a": 2}])
        db.commit()
    finally:
        db.close()

    with store.begin() as conn:
        conn.execute(
            sa.text("UPDATE undo_snapshots SET created_at = :t WHERE id = :i"),
            {
                "t": datetime.now(timezone.utc) - timedelta(seconds=task_store.UNDO_TTL_SECONDS + 60),
                "i": "old",
            },
        )

    _, undos = task_store.purge_expired()
    assert undos == 1


def test_purge_survives_a_broken_database(store, monkeypatch):
    """정리는 1시간마다 도는 잡이다 — 실패해도 예외를 밖으로 던지면 안 된다."""
    def _boom(*_args, **_kwargs):
        raise RuntimeError("DB 연결 끊김")

    monkeypatch.setattr(
        "app.repositories.background_task_repo.BackgroundTaskRepository.purge_older_than", _boom
    )
    assert task_store.purge_expired() == (0, 0)
