import logging

from sqlalchemy.orm import Session

from app.models.report_log_model import ReportLog
from app.models.user_model import User
from app.services.ai_usage import AI_TOOL_REPORT_MAIL, log_ai_usage
from app.services.analysis_service import AnalysisService
from app.services.comment_service import CommentService
from app.services.mail.base import AbstractMailSender
from app.services.report_builder_service import ReportBuilderService

logger = logging.getLogger(__name__)


class ReportOrchestrator:
    """분석 → 코멘트 → HTML 빌드 → 메일 발송 파이프라인 조합."""

    def __init__(
        self,
        analysis_svc: AnalysisService,
        comment_svc: CommentService,
        builder_svc: ReportBuilderService,
        mail_sender: AbstractMailSender,
        db: Session,
        user: User | None = None,
    ):
        self.analysis = analysis_svc
        self.comment = comment_svc
        self.builder = builder_svc
        self.mail = mail_sender
        self.db = db
        # 사용량 로그에 남길 실행 주체. 월간 크론처럼 사람이 없으면 None.
        self.user = user

    def run(
        self,
        curr_year: int,
        curr_month: int,
        prev_year: int,
        prev_month: int,
        recipients: list[str],
        subject: str = "",
    ) -> dict:
        if not subject:
            subject = f"[마케팅 리포트] {curr_year}년 {curr_month}월 성과 요약"

        log = ReportLog(
            curr_year=curr_year,
            curr_month=curr_month,
            prev_year=prev_year,
            prev_month=prev_month,
            recipients=", ".join(recipients),
            subject=subject,
            status="error",
        )
        try:
            comparison = self.analysis.compare(curr_year, curr_month, prev_year, prev_month)
            comment, usage = self.comment.generate_with_usage(comparison)
            # 코멘트가 나온 시점에 바로 남긴다 — 뒤의 메일 발송이 실패해도 토큰은 이미 썼다.
            log_ai_usage(
                user=self.user,
                tool=AI_TOOL_REPORT_MAIL,
                label=f"{curr_year}년 {curr_month}월",
                usage=usage,
            )
            html = self.builder.build(comparison, comment)
            self.mail.send(recipients, subject, html)
            log.status = "sent"
            logger.info("Report mail sent to %s", recipients)
            return {"status": "sent", "recipients": recipients}
        except Exception as exc:
            log.error_msg = str(exc)
            logger.exception("Report mail failed: %s", exc)
            raise
        finally:
            self.db.add(log)
            self.db.commit()
