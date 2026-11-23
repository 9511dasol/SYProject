"""FastAPI 앱의 OpenAPI 스키마를 파일로 내보낸다.

프런트의 타입을 이 파일에서 생성한다(front/scripts/generate-api-types.mjs).
서버를 띄우지 않고 앱 객체에서 바로 뽑으므로 DB·외부 API 없이도 돌아간다 —
CI 나 다른 개발자 환경에서 "백엔드를 켜야 타입을 만들 수 있는" 상황을 피하려는 것이다.

사용:
    python scripts/export_openapi.py [출력경로]
기본 출력: back/openapi.json
"""

import json
import logging
import sys
from pathlib import Path

# 앱 임포트 시 나오는 기동 로그로 출력이 더럽혀지지 않게 한다.
logging.disable(logging.INFO)

_BACK_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACK_DIR))

from app.main import app  # noqa: E402  (sys.path 조정 후에 임포트해야 한다)

DEFAULT_OUT = _BACK_DIR / "openapi.json"


def main() -> None:
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT
    spec = app.openapi()
    out.parent.mkdir(parents=True, exist_ok=True)
    # 정렬 + 개행 고정 — 내용이 같으면 파일도 같아야 "변경 없음"을 diff 로 판정할 수 있다.
    out.write_text(
        json.dumps(spec, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"OpenAPI 내보내기 완료: {out} (경로 {len(spec['paths'])}개)")


if __name__ == "__main__":
    main()
