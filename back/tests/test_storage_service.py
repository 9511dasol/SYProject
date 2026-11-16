"""Supabase Storage 연동 — 엑셀 원본·내보내기 결과가 전부 이 경로를 지난다.

실수가 나기 쉬운 자리가 몇 군데 있다.
- object path 조립(연·월 0 채움)이 틀리면 저장은 되는데 나중에 못 찾는다.
- "없으면 None", "없어도 조용히 통과" 같은 약속을 404 를 예외로 올려 깨면,
  이미 내려받은 파일을 다시 요청했을 때 500 이 난다.
- 서명 URL 조립이 틀리면 메일 안의 다운로드 링크가 죽는다.

네트워크는 타지 않는다 — httpx 호출만 대역으로 바꿔 요청 내용을 들여다본다.
"""

import httpx
import pytest

from app.core.settings import settings
from app.services import storage_service as svc

BUCKET = settings.SUPABASE_STORAGE_BUCKET
BASE = settings.SUPABASE_URL


class _Resp:
    """httpx.Response 중 이 모듈이 쓰는 부분만 흉내낸다."""

    def __init__(self, status_code=200, content=b"", payload=None):
        self.status_code = status_code
        self.content = content
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"{self.status_code}", request=None, response=None  # type: ignore[arg-type]
            )


@pytest.fixture
def captured(monkeypatch):
    """httpx 메서드 호출을 가로채 (메서드, url, kwargs) 로 모아 둔다."""
    calls: list[tuple[str, str, dict]] = []
    responses: dict[str, _Resp] = {}

    def _make(method: str):
        def _call(url, **kwargs):
            calls.append((method, url, kwargs))
            return responses.get(method, _Resp())
        return _call

    for method in ("put", "post", "get", "delete"):
        monkeypatch.setattr(svc.httpx, method, _make(method))

    return calls, responses


# ── object path 조립 ─────────────────────────────────────────────────────────


def test_excel_path_pads_year_and_month(captured):
    """2026년 3월이 '2026/3' 이 되면 나중에 '2026/03' 으로 찾을 때 안 보인다."""
    calls, _ = captured
    path = svc.upload_excel(2026, 3, b"xlsx")

    assert path == "2026/03/report.xlsx"
    assert calls[0][1] == f"{BASE}/storage/v1/object/{BUCKET}/2026/03/report.xlsx"


def test_upload_returns_the_path_it_was_given(captured):
    assert svc.upload_bytes("exports/2026/10/a.xlsx", b"x") == "exports/2026/10/a.xlsx"


# ── 업로드 ───────────────────────────────────────────────────────────────────


def test_upload_sends_content_and_upsert_header(captured):
    """x-upsert 가 없으면 같은 기간을 다시 올릴 때 409 가 난다."""
    calls, _ = captured
    svc.upload_bytes("a/b.xlsx", b"hello")

    method, _, kwargs = calls[0]
    assert method == "put"
    assert kwargs["content"] == b"hello"
    assert kwargs["headers"]["x-upsert"] == "true"
    assert "Bearer" in kwargs["headers"]["Authorization"]


def test_upload_defaults_to_the_excel_content_type(captured):
    calls, _ = captured
    svc.upload_bytes("a.xlsx", b"x")
    assert "spreadsheetml" in calls[0][2]["headers"]["Content-Type"]


def test_upload_content_type_can_be_overridden(captured):
    calls, _ = captured
    svc.upload_bytes("t.jpg", b"x", content_type="image/jpeg")
    assert calls[0][2]["headers"]["Content-Type"] == "image/jpeg"


def test_upload_failure_is_raised(captured):
    _, responses = captured
    responses["put"] = _Resp(status_code=500)

    with pytest.raises(httpx.HTTPStatusError):
        svc.upload_bytes("a.xlsx", b"x")


# ── 다운로드 ─────────────────────────────────────────────────────────────────


def test_download_returns_the_bytes(captured):
    _, responses = captured
    responses["get"] = _Resp(content=b"PK\x03\x04")
    assert svc.download_bytes("a.xlsx") == b"PK\x03\x04"


def test_missing_object_returns_none_instead_of_raising(captured):
    """1회용 다운로드를 다시 눌렀을 때 500 대신 '만료됨' 안내가 나가야 한다."""
    _, responses = captured
    responses["get"] = _Resp(status_code=404)
    assert svc.download_bytes("없는.xlsx") is None


def test_download_failure_other_than_404_is_raised(captured):
    _, responses = captured
    responses["get"] = _Resp(status_code=503)

    with pytest.raises(httpx.HTTPStatusError):
        svc.download_bytes("a.xlsx")


def test_download_excel_delegates_to_download_bytes(captured):
    _, responses = captured
    responses["get"] = _Resp(content=b"xlsx")
    assert svc.download_excel("2026/10/report.xlsx") == b"xlsx"


# ── 삭제 ─────────────────────────────────────────────────────────────────────


def test_delete_is_quiet_when_the_object_is_gone(captured):
    """내보내기 임시 파일 정리는 이미 지워져 있어도 실패로 보면 안 된다."""
    _, responses = captured
    responses["delete"] = _Resp(status_code=404)
    svc.delete_object("a.xlsx")  # 예외 없이 지나가야 한다


def test_delete_raises_on_a_real_failure(captured):
    _, responses = captured
    responses["delete"] = _Resp(status_code=500)

    with pytest.raises(httpx.HTTPStatusError):
        svc.delete_object("a.xlsx")


# ── 서명 URL ─────────────────────────────────────────────────────────────────


def test_signed_url_is_absolute(captured):
    """메일 본문에 들어가는 링크다 — 상대 경로면 클릭해도 열리지 않는다."""
    _, responses = captured
    responses["post"] = _Resp(payload={"signedURL": "/object/sign/reports/a.xlsx?token=abc"})

    url = svc.create_signed_url("a.xlsx")

    assert url == f"{BASE}/storage/v1/object/sign/reports/a.xlsx?token=abc"
    assert url.startswith("http")


def test_signed_url_expiry_defaults_to_three_days(captured):
    calls, responses = captured
    responses["post"] = _Resp(payload={"signedURL": "/x"})

    svc.create_signed_url("a.xlsx")

    assert calls[0][2]["json"]["expiresIn"] == 259_200


def test_signed_url_expiry_can_be_overridden(captured):
    calls, responses = captured
    responses["post"] = _Resp(payload={"signedURL": "/x"})

    svc.create_signed_url("a.xlsx", expires_in=60)

    assert calls[0][2]["json"]["expiresIn"] == 60


# ── 타임아웃 (업로드는 길게, 조회는 짧게) ────────────────────────────────────


def test_every_call_sets_a_timeout(captured):
    """하나라도 빠지면 그 호출이 무한정 매달린다."""
    calls, responses = captured
    responses["get"] = _Resp(content=b"x")
    responses["post"] = _Resp(payload={"signedURL": "/x"})

    svc.upload_bytes("a.xlsx", b"x")
    svc.download_bytes("a.xlsx")
    svc.delete_object("a.xlsx")
    svc.create_signed_url("a.xlsx")

    assert all(kwargs.get("timeout") for _, _, kwargs in calls)
