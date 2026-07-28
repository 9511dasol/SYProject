"""리포트 발송 파이프라인 조립.

예전에는 report_mail_router 의 비공개 함수(_build_orchestrator)를 main.py 와
다른 라우터가 끌어다 썼는데, 그 라우터는 MAIL_ENABLED 일 때만 등록되기 때문에
임포트 시점이 설정에 따라 달라지는 취약한 구조였다. 조립 책임을 여기로 옮긴다.
"""

from sqlalchemy.orm import Session

from app.services.analysis_service import AnalysisService
from app.services.comment_service import CommentService
from app.services.llm import build_llm
from app.services.mail import build_mail_sender
from app.services.report_builder_service import ReportBuilderService
from app.services.report_orchestrator import ReportOrchestrator


def build_orchestrator(db: Session) -> ReportOrchestrator:
    return ReportOrchestrator(
        analysis_svc=AnalysisService(db),
        comment_svc=CommentService(llm=build_llm()),
        builder_svc=ReportBuilderService(),
        mail_sender=build_mail_sender(),
        db=db,
    )
