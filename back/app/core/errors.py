"""오류 응답 표준화.

라우터마다 `detail=f"...: {exc}"` 로 원본 예외 문자열을 그대로 응답에 실어 왔다.
DB 오류 메시지나 내부 경로가 사용자 화면까지 새어 나가고(정보 노출), 문구 형식도
엔드포인트마다 달라 프론트가 보여줄 메시지를 신뢰하기 어려웠다.

경계는 "사용자가 고칠 수 있는가"로 나눈다.
- 5xx(서버 탓): 사유는 로그에만 남기고 사용자에게는 일반화된 안내만 준다.
- 4xx(입력 탓): 원인을 보여주는 편이 도움이 되므로 그대로 둔다.
"""

import logging

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

GENERIC_SERVER_ERROR = "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."


def server_error(
    message: str,
    exc: BaseException | None = None,
    *,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> HTTPException:
    """5xx 응답을 만들고 원본 예외는 로그에만 남긴다.

    `raise server_error("저장하지 못했습니다.", exc)` 형태로 쓴다 — 반환된 예외를
    호출부에서 raise 해야 원래 예외의 traceback 이 `from` 체인으로 이어진다.
    """
    if exc is not None:
        logger.error("%s", message, exc_info=exc)
    else:
        logger.error("%s", message)
    return HTTPException(status_code=status_code, detail=message)
