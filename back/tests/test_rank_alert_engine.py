"""순위 알림 판정·발송 — 이 기능의 약속을 고정한다.

- 같은 하락은 한 번만 알린다 (업로드를 다시 해도 메일이 또 나가지 않는다).
- 보내지 못했으면 '알렸음'으로 표시하지 않는다 — 설정을 고치면 그 하락이 알려져야 한다.
- 목표로 돌아오면 회복을 한 번 알리고 상태가 풀린다.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.models.user_model import User  # keyword_watch.created_by 가 users 를 참조한다
from app.services.mail.base import MailSendError
from app.services.rank.alert_engine import (
    ALERT_DROP,
    ALERT_RECOVERED,
    decide_alert,
    evaluate_and_notify,
)
from app.services.rank.alert_mail import RankAlertMailBuilder

NOW = datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc)
D0 = date(2026, 11, 18)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)  # keyword_watch 의 FK 대상
    KeywordWatch.__table__.create(engine)
    KeywordRankSnapshot.__table__.create(engine)
    RankAlertLog.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


class FakeSender:
    """보낸 내용을 기억하는 메일 발송기. fail=True 면 실제 공급자처럼 실패한다."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.sent: list[tuple[list[str], str, str]] = []

    def send(self, to, subject, html):
        if self.fail:
            raise MailSendError("SMTP 인증에 실패했습니다.")
        self.sent.append((to, subject, html))


def _watch(db, keyword="마케팅자동화", **kwargs) -> KeywordWatch:
    defaults = dict(
        keyword=keyword, device="all", target_rank=3.0, tolerance=0.5,
        breaches_required=2, cooldown_hours=24, alert_on_no_impression=True,
        status="active", breach_streak=0, alerted=False,
    )
    defaults.update(kwargs)
    watch = KeywordWatch(company_id=1, **defaults)
    db.add(watch)
    db.commit()
    return watch


def _snap(db, watch, stat_date, avg_rank, imp=100):
    db.add(KeywordRankSnapshot(company_id=1, 
        watch_id=watch.id, stat_date=stat_date, avg_rank=avg_rank,
        impressions=imp, clicks=5, source="upload",
    ))
    db.commit()


def _run(db, sender, recipients=("팀@example.com",)):
    builder = RankAlertMailBuilder()
    return evaluate_and_notify(
        db,
        recipients=list(recipients),
        mail_sender=sender,
        build_html=builder.build,
        now=NOW,
    )


# ── 판정 (순수 함수) ──────────────────────────────────────────────────────────


def test_drop_when_streak_reaches_threshold(db):
    watch = _watch(db, breach_streak=2, breaches_required=2)
    assert decide_alert(watch, NOW) == ALERT_DROP


def test_no_drop_below_threshold(db):
    watch = _watch(db, breach_streak=1, breaches_required=2)
    assert decide_alert(watch, NOW) is None


def test_already_alerted_does_not_repeat(db):
    watch = _watch(db, breach_streak=5, breaches_required=2, alerted=True)
    assert decide_alert(watch, NOW) is None


def test_recovery_when_back_under_target(db):
    watch = _watch(db, breach_streak=0, alerted=True)
    assert decide_alert(watch, NOW) == ALERT_RECOVERED


def test_no_recovery_if_never_alerted(db):
    watch = _watch(db, breach_streak=0, alerted=False)
    assert decide_alert(watch, NOW) is None


def test_still_breaching_is_not_a_recovery(db):
    """기준 미달일 뿐 여전히 이탈 중이면 '돌아왔습니다'라고 하면 안 된다.

    예전에는 기준(2회)에 못 미치는 연속 1회 이탈을 회복으로 봤다 — 순위가 더
    나빠지는 중인데 "목표 순위로 돌아왔습니다" 메일이 나갔다.
    """
    watch = _watch(db, breach_streak=1, breaches_required=2, alerted=True)
    assert decide_alert(watch, NOW) is None


def test_raising_threshold_does_not_fake_a_recovery(db):
    """기준값만 올려도 회복 메일이 나가던 경로."""
    watch = _watch(db, breach_streak=3, breaches_required=2, alerted=True)
    watch.breaches_required = 5          # 사용자가 기준을 완화
    assert decide_alert(watch, NOW) is None


def test_cooldown_blocks_second_drop(db):
    # 회복으로 alerted 가 풀린 직후 다시 떨어진 상황 — 쿨다운이 재알림을 막는다.
    watch = _watch(
        db, breach_streak=2, alerted=False,
        last_alerted_at=NOW - timedelta(hours=5), cooldown_hours=24,
    )
    assert decide_alert(watch, NOW) is None

    watch.last_alerted_at = NOW - timedelta(hours=25)
    assert decide_alert(watch, NOW) == ALERT_DROP


def test_naive_last_alerted_at_is_treated_as_utc(db):
    """SQLite 는 시간대를 잃는다 — 비교하다 터지면 안 된다."""
    watch = _watch(db, breach_streak=2, alerted=False)
    watch.last_alerted_at = (NOW - timedelta(hours=1)).replace(tzinfo=None)
    assert decide_alert(watch, NOW) is None  # 쿨다운 안 — 예외 없이 판정된다


def test_paused_watch_is_never_alerted(db):
    watch = _watch(db, breach_streak=9, status="paused", alerted=True)
    assert decide_alert(watch, NOW) is None


# ── 발송 ──────────────────────────────────────────────────────────────────────


def test_sends_digest_and_marks_alerted(db):
    watch = _watch(db, breach_streak=2)
    _snap(db, watch, D0 - timedelta(days=1), 3.2)
    _snap(db, watch, D0, 6.0)

    sender = FakeSender()
    result = _run(db, sender)
    db.commit()

    assert result.sent is True
    assert result.drops == 1 and result.recoveries == 0
    assert len(sender.sent) == 1
    to, subject, html = sender.sent[0]
    assert to == ["팀@example.com"]
    assert "목표 순위를 벗어났습니다" in subject
    assert "마케팅자동화" in html

    assert watch.alerted is True
    assert watch.last_alerted_at is not None
    log = db.query(RankAlertLog).one()
    assert log.alert_type == ALERT_DROP
    assert log.curr_rank == 6.0 and log.prev_rank == 3.2
    assert log.status == "sent"


def test_second_run_sends_nothing(db):
    watch = _watch(db, breach_streak=2)
    _snap(db, watch, D0, 6.0)

    sender = FakeSender()
    _run(db, sender)
    db.commit()
    result = _run(db, sender)
    db.commit()

    assert result.drops == 0 and result.sent is False
    assert len(sender.sent) == 1              # 같은 하락으로 두 번 보내지 않는다
    assert db.query(RankAlertLog).count() == 1


def test_recovery_sends_once_and_clears_state(db):
    watch = _watch(db, breach_streak=0, alerted=True, last_alerted_at=NOW - timedelta(days=2))
    _snap(db, watch, D0, 2.0)

    sender = FakeSender()
    result = _run(db, sender)
    db.commit()

    assert result.recoveries == 1 and result.sent is True
    assert "돌아왔습니다" in sender.sent[0][1]
    assert watch.alerted is False

    again = _run(db, sender)
    db.commit()
    assert again.recoveries == 0              # 회복도 한 번만
    assert len(sender.sent) == 1


def test_digest_groups_multiple_watches_into_one_mail(db):
    dropped = _watch(db, keyword="하락키워드", breach_streak=2)
    recovered = _watch(db, keyword="회복키워드", breach_streak=0, alerted=True,
                       last_alerted_at=NOW - timedelta(days=2))
    _snap(db, dropped, D0, 7.0)
    _snap(db, recovered, D0, 1.5)

    sender = FakeSender()
    result = _run(db, sender)
    db.commit()

    assert len(sender.sent) == 1              # 키워드마다 보내지 않는다
    assert result.drops == 1 and result.recoveries == 1
    assert "하락 1건 · 회복 1건" in sender.sent[0][1]
    html = sender.sent[0][2]
    assert "하락키워드" in html and "회복키워드" in html
    assert db.query(RankAlertLog).count() == 2  # 이력은 키워드 단위


def test_no_recipients_keeps_state_untouched(db):
    watch = _watch(db, breach_streak=2)
    _snap(db, watch, D0, 6.0)

    sender = FakeSender()
    result = _run(db, sender, recipients=())
    db.commit()

    assert result.drops == 1                   # 보낼 것은 있었다고 알려 준다
    assert result.sent is False
    assert result.skipped_reason is not None
    assert watch.alerted is False              # 알리지 않았으므로 상태도 그대로
    assert db.query(RankAlertLog).count() == 0

    # 수신자를 채우면 그 하락이 그대로 알려진다
    retried = _run(db, sender)
    db.commit()
    assert retried.sent is True and watch.alerted is True


def test_mail_disabled_keeps_state_untouched(db):
    watch = _watch(db, breach_streak=2)
    _snap(db, watch, D0, 6.0)

    result = evaluate_and_notify(
        db, recipients=["팀@example.com"], mail_sender=None,
        build_html=RankAlertMailBuilder().build, now=NOW,
    )
    db.commit()

    assert result.drops == 1 and result.sent is False
    assert watch.alerted is False


def test_send_failure_is_logged_and_retried_next_run(db):
    watch = _watch(db, breach_streak=2)
    _snap(db, watch, D0, 6.0)

    failing = FakeSender(fail=True)
    result = _run(db, failing)
    db.commit()

    assert result.sent is False
    assert "발송 실패" in (result.skipped_reason or "")
    assert watch.alerted is False              # 실패했으면 알린 게 아니다
    log = db.query(RankAlertLog).one()
    assert log.status == "error" and log.error_msg

    # 다음 평가에서 다시 시도된다
    ok = FakeSender()
    retried = _run(db, ok)
    db.commit()
    assert retried.sent is True and watch.alerted is True


def test_no_alerts_sends_nothing(db):
    _watch(db, breach_streak=0)
    sender = FakeSender()
    result = _run(db, sender)
    assert result.drops == 0 and result.recoveries == 0
    assert sender.sent == []


def test_no_impression_rank_renders_as_text_not_zero(db):
    watch = _watch(db, breach_streak=2)
    _snap(db, watch, D0, None, imp=0)

    sender = FakeSender()
    _run(db, sender)
    db.commit()

    html = sender.sent[0][2]
    assert "노출 없음" in html                 # 0위로 적으면 1위보다 좋아 보인다
