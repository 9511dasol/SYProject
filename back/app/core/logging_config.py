"""애플리케이션 로깅 설정.

설정하지 않으면 루트 로거가 WARNING이라 `logger.info(...)`가 전부 버려진다.
기동 단계별 진단 로그가 바로 그 레벨이어서, 설정 없이는 Cloud Run 로그에
"컨테이너가 PORT에서 리슨하지 못했다"만 남고 어디까지 진행했는지 알 수 없다.

uvicorn은 자기 로거(`uvicorn.*`)를 propagate=False로 따로 잡으므로,
여기서 루트에 핸들러를 붙여도 서로 간섭하지 않는다.
"""

import logging
import sys

_FORMAT = "%(levelname)s [%(name)s] %(message)s"


def _utf8_stdout():
    """stdout이 한글·em-dash를 버리지 않게 만든다.

    Windows 콘솔 기본 인코딩(cp949)은 로그 메시지에 흔히 쓰는 em-dash(—)를
    인코딩하지 못한다. 그러면 logging이 UnicodeEncodeError를 삼키고 그 줄을
    통째로 버려서, 정작 필요한 진단 로그만 조용히 사라진다.
    깨져 보이더라도 남는 편이 낫다.
    """
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    except (AttributeError, ValueError):
        pass  # 이미 교체된 스트림(pytest capture 등)이면 그대로 쓴다
    return sys.stdout


def configure_logging(level: str = "INFO") -> None:
    """루트 로거에 stdout 핸들러를 붙인다 (Cloud Run은 stdout을 수집한다).

    이미 설정돼 있으면(테스트의 caplog, `fastapi dev` 등) 레벨만 맞추고 둔다.
    """
    resolved = getattr(logging, level.upper(), logging.INFO)

    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(_utf8_stdout())
        handler.setFormatter(logging.Formatter(_FORMAT))
        root.addHandler(handler)
    root.setLevel(resolved)

    # SQLAlchemy의 echo=True 는 'sqlalchemy.engine.Engine' 에 자체 핸들러를 달고
    # 레벨을 INFO로 고정한다. 그대로 두면 그 핸들러와 위 루트 핸들러 양쪽으로
    # 모든 쿼리가 두 번씩 찍혀 기동 진단 로그를 묻어버린다.
    # (부모인 'sqlalchemy.engine' 레벨을 올려도 자식의 명시적 레벨이 이긴다.)
    logging.getLogger("sqlalchemy.engine.Engine").propagate = False
