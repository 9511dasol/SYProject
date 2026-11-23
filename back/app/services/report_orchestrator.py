import logging

from app.core.database import SessionLocal
from app.models.report_log_model import ReportLog
from app.models.user_model import User
from app.services import comment_cache
from app.services.ai_usage import AI_TOOL_REPORT_MAIL, log_ai_usage
from app.services.analysis_service import AnalysisService
from app.services.comment_service import CommentService
from app.services.mail.base import AbstractMailSender
from app.services.rank.report_section import build_rank_section
from app.services.report_builder_service import ReportBuilderService

logger = logging.getLogger(__name__)


def _save_report_log(log: ReportLog) -> None:
    """발송 기록을 전용 세션으로 남긴다.

    예전에는 호출자가 넘긴 세션에 add/commit 했다. 동기 발송 경로는 요청 스코프
    세션을 그대로 넘기므로, 그 요청에서 대기 중이던 다른 변경까지 함께 커밋될 수
    있었다(log_ai_usage 가 전용 세션을 쓰는 것과 같은 이유로 분리한다).

    기록 실패가 발송 결과를 덮어쓰지 않도록 예외는 로그만 남기고 삼킨다 —
    메일은 이미 나갔는데 기록 때문에 500 이 나가면 다시 보내게 된다.
    """
    db = SessionLocal()
    try:
        db.add(log)
        db.commit()
    except Exception:
        logger.exception("리포트 발송 기록 저장 실패 (status=%s)", log.status)
        db.rollback()
    finally:
        db.close()


class ReportOrchestrator:
    """분석 → 코멘트 → HTML 빌드 → 메일 발송 파이프라인 조합."""

    def __init__(
        self,
        analysis_svc: AnalysisService,
        comment_svc: CommentService,
        builder_svc: ReportBuilderService,
        mail_sender: AbstractMailSender,
        user: User | None = None,
    ):
        # 세션은 받지 않는다 — 발송 기록은 _save_report_log 가 전용 세션으로 남기고,
        # DB 조회는 이미 세션을 들고 있는 AnalysisService 가 맡는다.
        self.analysis = analysis_svc
        self.comment = comment_svc
        self.builder = builder_svc
        self.mail = mail_sender
        # 사용량 로그에 남길 실행 주체. 월간 크론처럼 사람이 없으면 None.
        self.user = user

    def _comment_for(self, comparison, curr_year: int, curr_month: int) -> str:
        """이 달의 코멘트. 같은 질문이면 저장된 답을 재사용한다.

        같은 달을 반복해 보내는 경로가 둘이다 — 관리자의 "재발송" 과 월간 자동 발송.
        실적이 그대로인데 매번 LLM 을 부르면 같은 답을 돈 주고 다시 사는 꼴이고,
        받는 사람 입장에서도 문구가 조금씩 달라져 혼란스럽다.
        """
        prompt_hash = comment_cache.fingerprint(self.comment.build_prompt(comparison))

        cached = comment_cache.lookup(curr_year, curr_month, prompt_hash)
        if cached is not None:
            logger.info("코멘트 재사용 (%d-%02d) — LLM 호출 생략", curr_year, curr_month)
            return cached

        result = self.comment.generate_with_usage(comparison)
        # 코멘트가 나온 시점에 바로 남긴다 — 뒤의 메일 발송이 실패해도 토큰은 이미 썼다.
        log_ai_usage(
            user=self.user,
            tool=AI_TOOL_REPORT_MAIL,
            label=f"{curr_year}년 {curr_month}월",
            usage=result.usage,
        )
        comment_cache.save(curr_year, curr_month, prompt_hash, result.text)
        return result.text

    def preview(
        self,
        curr_year: int,
        curr_month: int,
        prev_year: int,
        prev_month: int,
        subject: str = "",
    ) -> dict:
        """발송 없이, 실제로 나갈 메일과 같은 제목·코멘트·HTML 을 만든다.

        코멘트는 발송과 같은 캐시 경로(_comment_for)를 지난다 — 미리보기에서
        생성·캐시된 코멘트를 뒤이은 발송이 그대로 재사용하므로, 미리보기를 거쳐도
        코멘트 비용이 두 번 들지 않는다. 발송 기록(ReportLog)은 남기지 않는다.
        """
        if not subject:
            subject = f"[마케팅 리포트] {curr_year}년 {curr_month}월 성과 요약"
        comparison = self.analysis.compare(curr_year, curr_month, prev_year, prev_month)
        comment = self._comment_for(comparison, curr_year, curr_month)
        html = self.builder.build(comparison, comment)
        return {"subject": subject, "comment": comment, "html": html}

    def _rank_section(self):
        """리포트에 실을 키워드 순위 현황. 실패하면 그 구역만 빠진다.

        순위 한 조각(외부 API 포함) 때문에 월간 리포트 전체가 안 나가면 안 된다 —
        리포트의 본체는 어디까지나 지난달 실적이다.
        """
        db = SessionLocal()
        try:
            return build_rank_section(db)
        except Exception:
            logger.exception("리포트 순위 현황 생성 실패 — 해당 구역 없이 발송")
            return None
        finally:
            db.close()

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
            comment = self._comment_for(comparison, curr_year, curr_month)
            html = self.builder.build(comparison, comment, rank_section=self._rank_section())
            self.mail.send(recipients, subject, html)
            log.status = "sent"
            logger.info("Report mail sent to %s", recipients)
            return {"status": "sent", "recipients": recipients}
        except Exception as exc:
            log.error_msg = str(exc)
            logger.exception("Report mail failed: %s", exc)
            raise
        finally:
            _save_report_log(log)
