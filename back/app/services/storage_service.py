"""Supabase Storage(객체 스토리지) 업로드/다운로드.

엑셀 원본처럼 큰 바이너리는 Postgres bytea 대신 Supabase Storage에 저장한다.
대용량 파라미터를 Supabase 커넥션 풀러로 보내면 메시지 크기 제한으로
연결이 끊길 수 있어(WinError 10054 등), Storage REST API를 통해 별도로 전송한다.
"""

import httpx

from app.core.settings import settings

_EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _object_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{path}"


def upload_excel(year: int, month: int, content: bytes) -> str:
    """엑셀 바이트를 Storage에 업로드하고 object path를 반환한다."""
    path = f"{year:04d}/{month:02d}/report.xlsx"
    resp = httpx.put(
        _object_url(path),
        headers={
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": _EXCEL_CONTENT_TYPE,
            "x-upsert": "true",
        },
        content=content,
        timeout=60,
    )
    resp.raise_for_status()
    return path


def download_excel(path: str) -> bytes | None:
    """object path로 엑셀 바이트를 가져온다. 없으면 None."""
    resp = httpx.get(
        _object_url(path),
        headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"},
        timeout=60,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.content
