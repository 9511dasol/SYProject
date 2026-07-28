"""CSV·Excel 업로드 공통 검증.

이미지 업로드는 app/schemas/image_resize_schema.py 가 이미 크기·MIME를 검사하지만,
마케팅 데이터(CSV/Excel)와 키워드 비교(Excel) 업로드에는 아무 상한이 없어서
수백 MB짜리 파일도 그대로 메모리에 올라갔다. 같은 수준의 방어를 제공한다.

크기 검사는 두 겹이다.
  1. Content-Length 헤더 — 본문을 읽기 전에 거른다 (헤더가 없거나 거짓일 수 있음).
  2. 실제로 읽은 바이트 — 상한+1 바이트까지만 읽고 넘으면 중단한다.
"""

from fastapi import HTTPException, Request, UploadFile, status

from app.core.settings import settings

CSV_EXTENSIONS: frozenset[str] = frozenset({".csv", ".tsv", ".txt"})
EXCEL_EXTENSIONS: frozenset[str] = frozenset({".xlsx", ".xlsm"})
DATA_EXTENSIONS: frozenset[str] = CSV_EXTENSIONS | EXCEL_EXTENSIONS


def max_data_upload_bytes() -> int:
    return settings.MAX_DATA_UPLOAD_MB * 1_024 * 1_024


def _too_large(limit_bytes: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"파일 크기가 {limit_bytes // (1_024 * 1_024)}MB를 초과합니다.",
    )


def check_content_length(request: Request, *, limit_bytes: int | None = None) -> None:
    """본문을 읽기 전에 Content-Length로 1차 차단."""
    limit = limit_bytes if limit_bytes is not None else max_data_upload_bytes()
    raw = request.headers.get("content-length")
    if raw and raw.isdigit() and int(raw) > limit:
        raise _too_large(limit)


def _check_extension(filename: str, allowed: frozenset[str]) -> None:
    lowered = filename.lower()
    if not any(lowered.endswith(ext) for ext in allowed):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"지원하지 않는 파일 형식입니다: {filename}"
                f" (허용: {', '.join(sorted(allowed))})"
            ),
        )


async def read_data_upload(
    file: UploadFile,
    *,
    allowed_extensions: frozenset[str] = DATA_EXTENSIONS,
    limit_bytes: int | None = None,
) -> bytes:
    """확장자·크기를 검사하고 파일 바이트를 반환한다.

    상한을 넘는 파일은 전부 읽지 않고(상한+1 바이트에서 중단) 413을 던진다.
    """
    limit = limit_bytes if limit_bytes is not None else max_data_upload_bytes()
    filename = file.filename or ""
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="파일 이름이 없습니다.")

    _check_extension(filename, allowed_extensions)

    content = await file.read(limit + 1)
    if len(content) > limit:
        raise _too_large(limit)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"빈 파일입니다: {filename}"
        )
    return content


async def read_data_uploads(
    files: list[UploadFile],
    *,
    allowed_extensions: frozenset[str] = DATA_EXTENSIONS,
) -> list[tuple[bytes, str]]:
    """여러 파일을 검증해 [(bytes, filename), ...]로 반환한다.

    파일 하나하나뿐 아니라 합계도 상한으로 막는다 — 상한 이하 파일을 수십 개
    올리는 식으로 우회할 수 있기 때문이다.
    """
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="업로드된 파일이 없습니다.")

    limit = max_data_upload_bytes()
    entries: list[tuple[bytes, str]] = []
    total = 0

    for file in files:
        content = await read_data_upload(file, allowed_extensions=allowed_extensions)
        total += len(content)
        if total > limit:
            raise _too_large(limit)
        entries.append((content, file.filename or ""))

    return entries
