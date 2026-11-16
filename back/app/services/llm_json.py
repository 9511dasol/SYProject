"""LLM 이 돌려준 텍스트에서 JSON 을 꺼낸다.

모델은 요청하지 않아도 ```json 코드블록으로 감싸거나 앞뒤에 설명을 덧붙인다.
그래서 "코드블록 제거 → json.loads → 실패하면 중괄호 범위를 다시 찾기" 흐름이
헤딩 추천과 요소 분석 두 곳에 똑같이 복제돼 있었다. 한쪽만 고치면 다른 쪽이
조용히 어긋나므로 한곳에 둔다.
"""

import json
import re
from typing import Callable

_FENCE_OPEN = re.compile(r"^```(?:json)?\s*\n?", re.MULTILINE)
_FENCE_CLOSE = re.compile(r"\n?```\s*$", re.MULTILINE)
_BRACED = re.compile(r"\{.*\}", re.DOTALL)


def strip_code_fence(raw: str) -> str:
    """마크다운 코드 블록 표시를 걷어내고 앞뒤 공백을 정리한다."""
    raw = raw.strip()
    raw = _FENCE_OPEN.sub("", raw)
    raw = _FENCE_CLOSE.sub("", raw)
    return raw.strip()


def parse_json_object(
    raw: str,
    *,
    error: Callable[[str], Exception],
    excerpt: int = 300,
) -> dict:
    """LLM 응답 → dict. 코드블록이나 잡설이 섞여 있어도 JSON 본문을 찾아낸다.

    error 는 실패 시 던질 예외를 만드는 함수다 — 호출부마다 예외 타입이 달라
    (헤딩은 RuntimeError, 요소 분석은 ImageAnalyzeError) 주입받는다.
    excerpt 는 오류 메시지에 실을 응답 앞부분 길이.
    """
    cleaned = strip_code_fence(raw)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # 설명 문장이 앞뒤에 붙은 경우 — 중괄호로 둘러싸인 부분만 다시 시도한다
        match = _BRACED.search(cleaned)
        if not match:
            raise error(f"AI 응답에서 JSON을 찾을 수 없습니다: {cleaned[:excerpt]!r}")
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError as exc:
            raise error(f"AI 응답 JSON이 잘려 파싱할 수 없습니다: {cleaned[:excerpt]!r}") from exc

    if not isinstance(data, dict):
        raise error(f"AI 응답 형식이 예상과 다릅니다: {cleaned[:excerpt]!r}")
    return data
