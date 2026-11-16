"""서버 오류가 내부 사정을 사용자에게 흘리지 않아야 한다.

라우터마다 `detail=f"...: {exc}"` 로 원본 예외 문자열을 응답에 실어, DB 오류 메시지나
내부 경로가 화면까지 새어 나갈 수 있었다. 또 아무도 잡지 않은 예외는 어느 요청이 왜
깨졌는지 로그에 남지 않았다. 지금은 전역 핸들러가 로그를 남기고 일반화된 문구만 준다.

입력 오류(4xx)는 사용자가 고칠 수 있으므로 사유를 그대로 보여준다 — 그 경계도 함께 고정한다.
"""

import logging

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import GENERIC_SERVER_ERROR, server_error
from app.main import app as real_app


@pytest.fixture
def app_with_boom():
    """전역 핸들러를 공유하는 앱에 일부러 터지는 라우트를 붙인다."""
    app = FastAPI()
    app.add_exception_handler(
        Exception, real_app.exception_handlers[Exception]  # type: ignore[index]
    )

    @app.get("/boom")
    def boom():
        raise RuntimeError("psycopg2: password authentication failed for user 'admin'")

    @app.get("/bad-input")
    def bad_input():
        raise HTTPException(status_code=422, detail="지원하지 않는 파일 형식입니다.")

    return app


def test_unhandled_exception_returns_generic_message(app_with_boom):
    client = TestClient(app_with_boom, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == 500
    assert response.json()["detail"] == GENERIC_SERVER_ERROR


def test_unhandled_exception_does_not_leak_internals(app_with_boom):
    """DB 자격증명·드라이버 이름 같은 내부 문자열이 응답에 섞이면 안 된다."""
    client = TestClient(app_with_boom, raise_server_exceptions=False)
    body = client.get("/boom").text

    for leaked in ("psycopg2", "password authentication", "admin", "Traceback"):
        assert leaked not in body


def test_input_errors_still_explain_themselves(app_with_boom):
    """4xx 는 사용자가 고칠 수 있으므로 사유를 그대로 보여준다."""
    client = TestClient(app_with_boom, raise_server_exceptions=False)
    response = client.get("/bad-input")

    assert response.status_code == 422
    assert response.json()["detail"] == "지원하지 않는 파일 형식입니다."


def test_unhandled_exception_is_logged_with_the_route(app_with_boom, caplog):
    """응답에서 사유를 지운 만큼, 로그에는 반드시 남아야 추적이 가능하다."""
    client = TestClient(app_with_boom, raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR):
        client.get("/boom")

    assert "/boom" in caplog.text
    assert "password authentication failed" in caplog.text  # traceback 이 로그에는 남는다


# ── server_error 헬퍼 ────────────────────────────────────────────────────────


def test_server_error_keeps_the_reason_out_of_the_response():
    exc = server_error("저장하지 못했습니다.", RuntimeError("UniqueViolation: duplicate key"))

    assert exc.status_code == 500
    assert exc.detail == "저장하지 못했습니다."
    assert "UniqueViolation" not in str(exc.detail)


def test_server_error_logs_the_original_exception(caplog):
    with caplog.at_level(logging.ERROR):
        server_error("저장하지 못했습니다.", RuntimeError("UniqueViolation: duplicate key"))

    assert "UniqueViolation" in caplog.text
