"""AI 호출 사용량 기록 (ai_tool_usage_logs).

이미지·헤딩 도구는 라우터에서 직접 기록해 왔지만, 코멘트 생성(LLM 호출)은 기록도
예산 게이트도 없어서 그 버튼으로 쓴 토큰이 관리자 화면의 사용량과 월 예산 집계에서
통째로 빠져 있었다. 그 경로를 검증한다.
"""

import pytest

from app.models.user_model import User
from app.services import ai_usage
from app.services.ai_usage import (
    AI_TOOL_MARKETING_COMMENT,
    AI_TOOL_REPORT_MAIL,
    log_ai_usage,
)
from app.services.token_usage import TokenUsage

_USAGE = TokenUsage(prompt_tokens=1200, output_tokens=300, total_tokens=1500)


@pytest.fixture
def repo(mocker):
    """SessionLocal 과 리포지토리를 갈아끼우고 create 호출을 관찰한다."""
    mocker.patch.object(ai_usage, "SessionLocal", return_value=mocker.MagicMock())
    return mocker.patch.object(ai_usage, "AIToolUsageLogRepository").return_value


class TestLogAiUsage:
    def test_records_tokens_for_the_acting_user(self, repo):
        user = User(id=7, email="me@example.com")

        log_ai_usage(user=user, tool=AI_TOOL_MARKETING_COMMENT, label="26년 7월", usage=_USAGE)

        kwargs = repo.create.call_args.kwargs
        assert kwargs["user"] is user
        assert kwargs["tool"] == AI_TOOL_MARKETING_COMMENT
        assert kwargs["image_filename"] == "26년 7월"
        assert kwargs["prompt_tokens"] == 1200
        assert kwargs["output_tokens"] == 300
        assert kwargs["total_tokens"] == 1500

    def test_call_is_still_recorded_when_usage_is_unknown(self, repo):
        """토큰을 못 얻어도 건수는 남긴다 — 안 남기면 '안 썼다'와 구분되지 않는다."""
        log_ai_usage(user=User(id=7, email="me@example.com"),
                     tool=AI_TOOL_MARKETING_COMMENT, label="26년 7월", usage=None)

        kwargs = repo.create.call_args.kwargs
        assert kwargs["total_tokens"] is None
        assert kwargs["tool"] == AI_TOOL_MARKETING_COMMENT

    def test_system_run_without_a_user_is_recorded(self, repo):
        """월간 크론처럼 사람이 없는 호출도 예산에 잡혀야 한다."""
        log_ai_usage(user=None, tool=AI_TOOL_REPORT_MAIL, label="26년 7월", usage=_USAGE)

        logged_user = repo.create.call_args.kwargs["user"]
        assert logged_user.id == 0
        assert logged_user.email == "(자동 실행)"

    def test_failure_is_swallowed(self, repo):
        """기록이 실패해도 예외를 올리지 않는다.

        코멘트는 이미 저장됐는데 로그 때문에 500이 나가면 사용자는 생성이 실패한 줄
        알고 같은 버튼을 다시 눌러 토큰을 한 번 더 쓴다.
        """
        repo.create.side_effect = RuntimeError("db down")

        log_ai_usage(user=None, tool=AI_TOOL_REPORT_MAIL, label="26년 7월", usage=_USAGE)


class TestReportOrchestratorLogsUsage:
    """리포트 메일도 같은 CommentService 를 쓴다 — 여기 토큰도 예산에 잡혀야 한다."""

    @staticmethod
    def _orchestrator(mocker, user=None, mail_fails=False):
        from app.services.report_orchestrator import ReportOrchestrator

        comment_svc = mocker.MagicMock()
        comment_svc.generate_with_usage.return_value = ("코멘트", _USAGE)
        mail = mocker.MagicMock()
        if mail_fails:
            mail.send.side_effect = RuntimeError("smtp down")

        return ReportOrchestrator(
            analysis_svc=mocker.MagicMock(),
            comment_svc=comment_svc,
            builder_svc=mocker.MagicMock(),
            mail_sender=mail,
            db=mocker.MagicMock(),
            user=user,
        )

    def test_usage_is_logged_for_the_sender(self, mocker):
        logged = mocker.patch("app.services.report_orchestrator.log_ai_usage")
        user = User(id=3, email="sender@example.com")

        self._orchestrator(mocker, user=user).run(2026, 7, 2026, 6, ["to@example.com"])

        kwargs = logged.call_args.kwargs
        assert kwargs["user"] is user
        assert kwargs["tool"] == AI_TOOL_REPORT_MAIL
        assert kwargs["label"] == "2026년 7월"
        assert kwargs["usage"] == _USAGE

    def test_usage_is_logged_even_if_the_mail_fails(self, mocker):
        """메일 발송이 깨져도 토큰은 이미 썼다 — 기록에서 빠지면 예산이 어긋난다."""
        logged = mocker.patch("app.services.report_orchestrator.log_ai_usage")

        with pytest.raises(RuntimeError):
            self._orchestrator(mocker, mail_fails=True).run(2026, 7, 2026, 6, ["to@example.com"])

        logged.assert_called_once()


class TestToolKeys:
    def test_tool_keys_fit_the_column(self):
        """ai_tool_usage_logs.tool 은 String(30) 이다."""
        for tool in (AI_TOOL_MARKETING_COMMENT, AI_TOOL_REPORT_MAIL):
            assert len(tool) <= 30
