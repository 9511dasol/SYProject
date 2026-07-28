"""CSV·Excel 업로드 검증.

이미지 업로드는 image_resize_schema가 이미 크기·MIME를 검사했지만,
마케팅 데이터와 키워드 비교 업로드에는 아무 상한이 없어 수백 MB짜리 파일도
그대로 메모리에 올라갔다.
"""

import io

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers, UploadFile as StarletteUploadFile
from starlette.requests import Request

from app.core import uploads
from app.core.settings import settings


def _upload(filename: str, content: bytes) -> UploadFile:
    return StarletteUploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": "application/octet-stream"}),
    )


def _request(content_length: str | None) -> Request:
    headers = [(b"content-length", content_length.encode())] if content_length else []
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": "/api/marketing/upload",
        "headers": headers,
        "client": ("203.0.113.7", 12345),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    })


# ── Content-Length 1차 검사 ───────────────────────────────────────────────────


def test_content_length_under_limit_passes():
    uploads.check_content_length(_request("1024"))


def test_content_length_over_limit_rejected():
    over = str(uploads.max_data_upload_bytes() + 1)
    with pytest.raises(HTTPException) as exc_info:
        uploads.check_content_length(_request(over))
    assert exc_info.value.status_code == 413


def test_missing_content_length_passes():
    """헤더가 없어도 통과시킨다 — 실제 크기는 read_data_upload가 다시 검사한다."""
    uploads.check_content_length(_request(None))


def test_non_numeric_content_length_passes():
    uploads.check_content_length(_request("not-a-number"))


# ── 확장자 검사 ───────────────────────────────────────────────────────────────


async def test_excel_extension_accepted():
    content = await uploads.read_data_upload(
        _upload("report.xlsx", b"PK\x03\x04data"), allowed_extensions=uploads.EXCEL_EXTENSIONS
    )
    assert content == b"PK\x03\x04data"


async def test_extension_is_case_insensitive():
    content = await uploads.read_data_upload(
        _upload("REPORT.XLSX", b"data"), allowed_extensions=uploads.EXCEL_EXTENSIONS
    )
    assert content == b"data"


async def test_wrong_extension_rejected():
    """xlrd가 없어 .xls는 어차피 파싱에 실패한다 — 파싱 오류(422) 대신 415로 명확히 거른다."""
    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_upload(
            _upload("report.xls", b"data"), allowed_extensions=uploads.EXCEL_EXTENSIONS
        )
    assert exc_info.value.status_code == 415


async def test_executable_upload_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_upload(_upload("payload.exe", b"MZ\x90\x00"))
    assert exc_info.value.status_code == 415


async def test_missing_filename_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_upload(_upload("", b"data"))
    assert exc_info.value.status_code == 400


# ── 크기 검사 ─────────────────────────────────────────────────────────────────


async def test_oversized_file_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_upload(_upload("big.csv", b"x" * 101), limit_bytes=100)
    assert exc_info.value.status_code == 413


async def test_file_exactly_at_limit_accepted():
    content = await uploads.read_data_upload(_upload("edge.csv", b"x" * 100), limit_bytes=100)
    assert len(content) == 100


async def test_empty_file_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_upload(_upload("empty.csv", b""))
    assert exc_info.value.status_code == 400


# ── 다중 업로드 ───────────────────────────────────────────────────────────────


async def test_multiple_uploads_return_bytes_and_names():
    entries = await uploads.read_data_uploads(
        [_upload("a.csv", b"aaa"), _upload("b.csv", b"bb")],
        allowed_extensions=uploads.CSV_EXTENSIONS,
    )
    assert entries == [(b"aaa", "a.csv"), (b"bb", "b.csv")]


async def test_empty_file_list_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_uploads([])
    assert exc_info.value.status_code == 400


async def test_combined_size_over_limit_rejected(monkeypatch):
    """개별 파일이 상한 이하여도 합계로는 넘길 수 없어야 한다."""
    monkeypatch.setattr(settings, "MAX_DATA_UPLOAD_MB", 1)
    one_mb = 1_024 * 1_024
    files = [_upload(f"{i}.csv", b"x" * (one_mb // 2)) for i in range(3)]

    with pytest.raises(HTTPException) as exc_info:
        await uploads.read_data_uploads(files, allowed_extensions=uploads.CSV_EXTENSIONS)
    assert exc_info.value.status_code == 413
