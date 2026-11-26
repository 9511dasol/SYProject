"""순위 알림 실행 조립 — 설정에서 수신자·메일 발송기를 꺼내 엔진에 넘긴다.

업로드 직후(라우터)와 매일 정해진 시각(스케줄러) 두 경로가 같은 함수를 쓴다.
조립을 여기 모아 두면 두 경로가 서로 다른 조건으로 동작하는 일이 없다.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.settings import settings
from app.services.mail import build_mail_sender, mail_config_error
from app.services.rank.alert_engine import AlertRunResult, evaluate_and_notify
from app.services.rank.alert_mail import RankAlertMailBuilder

logger = logging.getLogger(__name__)

_builder = RankAlertMailBuilder()


def alert_recipients() -> list[str]:
    return [r.strip() for r in settings.RANK_ALERT_RECIPIENTS.split(",") if r.strip()]


def run_rank_alerts(db: Session, company_id: int | None = None) -> AlertRunResult:
    """알림 대상을 평가해 보낸다. commit 은 호출부가 한다.

    메일이 꺼져 있거나 수신자가 없어도 평가는 돈다 — 보낼 것이 있었는지를
    호출부가 알아야 화면에 "수신자를 설정하면 알림이 나갑니다"를 띄울 수 있다.

    company_id 는 요청 경로(업로드·수동 평가)의 기업 범위다. 크론은 None(전체) —
    수신자가 아직 전역 설정(RANK_ALERT_RECIPIENTS)이라 기업별 발송은 추후 과제다.
    """
    # 설정이 비어 있으면 아예 붙지 않는다. 그냥 보내 보면 업로드마다 SMTP 연결을
    # 30초씩 기다렸다 실패하고, 그때마다 감시 수만큼 오류 이력이 쌓인다 —
    # 고치기 전까지 영원히 반복된다. 다른 메일 경로가 mail_config_error 로
    # 먼저 거르는 것과 같은 이유다.
    config_error = mail_config_error()
    sender = build_mail_sender() if config_error is None else None
    result = evaluate_and_notify(
        db,
        recipients=alert_recipients(),
        mail_sender=sender,
        build_html=_builder.build,
        company_id=company_id,
    )
    # 엔진의 일반 문구 대신 "무엇이 비었는지"를 그대로 전달한다.
    if config_error is not None and result.skipped_reason is not None:
        result.skipped_reason = config_error
    return result
