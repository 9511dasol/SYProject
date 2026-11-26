"""순위 하락·회복 알림 판정과 발송.

판정(decide_alert)은 DB도 메일도 모르는 순수 함수다 — 이 기능에서 틀리면 가장
곤란한 부분이라 따로 떼어 테스트한다. 나머지(evaluate_and_notify)는 그 판정을
전체 감시에 돌려 한 통의 다이제스트로 묶고 이력을 남긴다.

왜 다이제스트 한 통인가
──────────────────────
감시 키워드가 수십 개면 키워드마다 메일을 보내는 순간 받는 사람은 알림을 끈다.
한 번 평가에 한 통, 그 안에 하락과 회복을 표로 담는다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.keyword_watch_model import KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.repositories.keyword_watch_repo import KeywordWatchRepository
from app.services.mail.base import AbstractMailSender

logger = logging.getLogger(__name__)

ALERT_DROP = "drop"
ALERT_RECOVERED = "recovered"


def _aware(dt: datetime | None) -> datetime | None:
    """시간대 없는 값을 UTC 로 본다.

    DateTime(timezone=True) 로 선언해도 SQLite 는 시간대를 잃는다. 그대로 비교하면
    "can't compare offset-naive and offset-aware datetimes" 로 터지는데, 하필
    쿨다운 계산처럼 한참 뒤에야 조건이 맞는 경로라 평소엔 드러나지 않는다.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def decide_alert(watch: KeywordWatch, now: datetime) -> str | None:
    """이 감시가 지금 알릴 것이 있는지 — "drop" | "recovered" | None.

    - 연속 이탈이 기준에 닿으면 하락. 단 이미 알린 상태면 다시 알리지 않는다.
    - 쿨다운은 "직전 알림 이후 N시간"이다. 올랐다 내렸다를 반복하는 키워드가
      매번 메일을 만들지 않게 한다.
    - 알린 상태에서 **실제로 목표 안으로 돌아왔을 때만** 회복을 한 번 알린다.

    회복 조건이 `breach_streak == 0` 인 이유
    ───────────────────────────────────────
    예전에는 "기준에 못 미치면 회복"으로 봤는데, 기준이 2회일 때 연속 1회 이탈은
    여전히 **이탈 중**인데도 "목표 순위로 돌아왔습니다" 메일이 나갔다. 기준값을
    올리기만 해도(PATCH) 같은 일이 벌어졌다. streak 은 최신 기록부터 거슬러 센
    값이라 0 이라는 것은 "가장 최근 기록이 목표 안"이라는 뜻이고, 그게 회복이다.
    """
    if watch.status != "active":
        return None

    if watch.breach_streak >= watch.breaches_required:
        if watch.alerted:
            return None  # 같은 하락은 한 번만
        last = _aware(watch.last_alerted_at)
        if last is not None and now - last < timedelta(hours=watch.cooldown_hours):
            return None
        return ALERT_DROP

    if watch.alerted and watch.breach_streak == 0:
        return ALERT_RECOVERED
    # 0 < streak < 기준: 아직 이탈 중이다. 알린 상태를 유지한 채 조용히 지켜본다.
    return None


@dataclass
class AlertItem:
    """메일 본문과 이력에 함께 쓰이는 알림 한 건."""

    watch: KeywordWatch
    alert_type: str
    curr_rank: float | None
    prev_rank: float | None
    stat_date: str  # "YYYY-MM-DD" — 기록이 없으면 빈 문자열


@dataclass
class AlertRunResult:
    drops: int = 0
    recoveries: int = 0
    sent: bool = False
    # 보낼 것이 있었지만 보내지 못한 이유 (수신자 미설정, 메일 비활성화, 발송 실패)
    skipped_reason: str | None = None
    keywords: list[str] = field(default_factory=list)


def collect_alerts(
    db: Session, now: datetime, company_id: int | None = None
) -> list[AlertItem]:
    """알릴 거리가 있는 감시를 모은다. 상태는 아직 바꾸지 않는다 —
    발송에 성공한 뒤에 바꿔야 실패했을 때 다음 평가에서 다시 시도된다.

    후보를 고른 다음 그 행들만 잠그고 **한 번 더 판정한다**. 업로드 직후 평가와
    크론이 겹치면 둘 다 "아직 안 알림"을 보고 같은 메일을 두 번 보내기 때문이다.

    company_id 가 있으면(요청 경로) 그 기업의 감시만 평가한다. 크론은 None(전체).
    """
    repo = KeywordWatchRepository(db, company_id)
    candidates = [w for w in repo.list_all() if decide_alert(w, now) is not None]
    locked = repo.lock_for_alert([w.id for w in candidates])
    # 직전·현재 순위는 후보 전체를 한 쿼리로 — 첫 대량 업로드처럼 여럿이 동시에
    # 이탈하면 후보마다 조회하던 예전 방식은 후보 수만큼 왕복이 생겼다.
    recent_by_watch = repo.recent_desc_bulk([w.id for w in candidates], 2)

    items: list[AlertItem] = []
    for candidate in candidates:
        watch = locked.get(candidate.id, candidate)
        # 잠그는 사이 다른 평가가 먼저 알렸다면 여기서 걸러진다.
        alert_type = decide_alert(watch, now)
        if alert_type is None:
            continue
        recent = recent_by_watch.get(watch.id, [])
        curr = recent[0] if recent else None
        prev = recent[1] if len(recent) > 1 else None
        items.append(
            AlertItem(
                watch=watch,
                alert_type=alert_type,
                curr_rank=curr.avg_rank if curr else None,
                prev_rank=prev.avg_rank if prev else None,
                stat_date=curr.stat_date.isoformat() if curr else "",
            )
        )
    return items


def _save_logs(
    db: Session,
    items: list[AlertItem],
    recipients: list[str],
    status: str,
    error_msg: str | None,
) -> None:
    joined = ", ".join(recipients)
    for item in items:
        db.add(
            RankAlertLog(
                company_id=item.watch.company_id,
                watch_id=item.watch.id,
                keyword=item.watch.keyword,
                device=item.watch.device,
                alert_type=item.alert_type,
                target_rank=item.watch.target_rank,
                curr_rank=item.curr_rank,
                prev_rank=item.prev_rank,
                breach_streak=item.watch.breach_streak,
                recipients=joined,
                status=status,
                error_msg=error_msg,
            )
        )


def evaluate_and_notify(
    db: Session,
    *,
    recipients: list[str],
    mail_sender: AbstractMailSender | None,
    build_html,
    now: datetime | None = None,
    company_id: int | None = None,
) -> AlertRunResult:
    """알림 대상을 모아 한 통으로 보내고 이력을 남긴다. commit 은 호출부가 한다.

    mail_sender 가 None 이거나 수신자가 없으면 **상태를 바꾸지 않는다**. 보내지도
    않고 "알렸음"으로 표시하면, 설정을 고친 뒤에도 그 하락은 영영 알려지지 않는다.
    """
    now = now or datetime.now(timezone.utc)
    items = collect_alerts(db, now, company_id)

    result = AlertRunResult(
        drops=sum(1 for i in items if i.alert_type == ALERT_DROP),
        recoveries=sum(1 for i in items if i.alert_type == ALERT_RECOVERED),
        keywords=[i.watch.keyword for i in items],
    )
    if not items:
        return result

    if mail_sender is None:
        result.skipped_reason = "메일 발송이 비활성화되어 있습니다."
        return result
    if not recipients:
        result.skipped_reason = "알림 수신자가 설정되지 않았습니다 (RANK_ALERT_RECIPIENTS)."
        return result

    subject = _subject(result)
    try:
        mail_sender.send(recipients, subject, build_html(items))
    except Exception as exc:
        # 발송 실패도 이력에 남긴다 — 상태는 그대로 둬서 다음 평가에 다시 시도된다.
        logger.exception("순위 알림 메일 발송 실패 (%d건)", len(items))
        _save_logs(db, items, recipients, "error", str(exc))
        result.skipped_reason = f"메일 발송 실패: {exc}"
        return result

    for item in items:
        if item.alert_type == ALERT_DROP:
            item.watch.alerted = True
            item.watch.last_alerted_at = now
        else:
            item.watch.alerted = False
    _save_logs(db, items, recipients, "sent", None)

    result.sent = True
    logger.info(
        "순위 알림 발송 — 하락 %d · 회복 %d → %s", result.drops, result.recoveries, recipients
    )
    return result


def _subject(result: AlertRunResult) -> str:
    if result.drops and result.recoveries:
        return f"[순위 알림] 하락 {result.drops}건 · 회복 {result.recoveries}건"
    if result.drops:
        return f"[순위 알림] 키워드 {result.drops}건이 목표 순위를 벗어났습니다"
    return f"[순위 알림] 키워드 {result.recoveries}건이 목표 순위로 돌아왔습니다"
