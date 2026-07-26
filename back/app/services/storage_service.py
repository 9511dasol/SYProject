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


def upload_bytes(path: str, content: bytes, content_type: str = _EXCEL_CONTENT_TYPE) -> str:
    """임의 object path에 바이트를 업로드하고 object path를 그대로 반환한다."""
    resp = httpx.put(
        _object_url(path),
        headers={
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        content=content,
        timeout=120,
    )
    resp.raise_for_status()
    return path


def upload_excel(year: int, month: int, content: bytes) -> str:
    """엑셀 바이트를 Storage에 업로드하고 object path를 반환한다."""
    return upload_bytes(f"{year:04d}/{month:02d}/report.xlsx", content)


def create_signed_url(path: str, expires_in: int = 259_200) -> str:
    """object path로 서명된 다운로드 URL을 생성한다 (기본 만료: 3일).

    이메일로 큰 파일을 보낼 때, 첨부 대신 이 링크를 본문에 담아 보내면
    메일 서버의 첨부 용량 제한(대략 25MB)이나 BFF 응답 크기 제한과 무관하게 전달할 수 있다.
    """
    resp = httpx.post(
        f"{settings.SUPABASE_URL}/storage/v1/object/sign/{settings.SUPABASE_STORAGE_BUCKET}/{path}",
        headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"},
        json={"expiresIn": expires_in},
        timeout=30,
    )
    resp.raise_for_status()
    signed_path = resp.json()["signedURL"]
    return f"{settings.SUPABASE_URL}/storage/v1{signed_path}"


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
