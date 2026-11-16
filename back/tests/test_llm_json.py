"""LLM 응답에서 JSON 을 꺼내는 공용 규칙.

모델은 요청하지 않아도 ```json 으로 감싸거나 앞뒤에 설명을 덧붙인다. 헤딩 추천과
요소 분석이 같은 규칙을 써야 하는데 예전에는 각자 구현이라, 한쪽만 고치면 다른 쪽이
조용히 어긋났다. 합친 규칙의 경계를 직접 고정한다.
"""

import pytest

from app.services.llm_json import parse_json_object, strip_code_fence


class Boom(Exception):
    """호출부마다 예외 타입이 다르다 — 주입된 타입이 그대로 나오는지 확인용."""


def _parse(raw: str, excerpt: int = 300):
    return parse_json_object(raw, error=Boom, excerpt=excerpt)


# ── 코드블록 제거 ────────────────────────────────────────────────────────────


def test_plain_json_is_untouched():
    assert strip_code_fence('{"a": 1}') == '{"a": 1}'


@pytest.mark.parametrize("fence", ["```json", "```"])
def test_code_fence_is_stripped(fence):
    assert strip_code_fence(f'{fence}\n{{"a": 1}}\n```') == '{"a": 1}'


def test_surrounding_whitespace_is_trimmed():
    assert strip_code_fence('\n\n  {"a": 1}  \n') == '{"a": 1}'


def test_stripping_is_idempotent():
    """호출부가 한 번 벗기고 다시 넘겨도 결과가 같아야 한다."""
    once = strip_code_fence('```json\n{"a": 1}\n```')
    assert strip_code_fence(once) == once


# ── 파싱 ─────────────────────────────────────────────────────────────────────


def test_plain_object_is_parsed():
    assert _parse('{"headings": []}') == {"headings": []}


def test_fenced_object_is_parsed():
    assert _parse('```json\n{"elements": [1]}\n```') == {"elements": [1]}


def test_object_is_found_among_surrounding_prose():
    """모델이 '네, 분석했습니다' 같은 말을 붙여도 본문은 찾아내야 한다."""
    raw = '물론입니다! 결과는 다음과 같습니다.\n{"a": 1}\n도움이 되었길 바랍니다.'
    assert _parse(raw) == {"a": 1}


def test_nested_braces_survive_the_rescan():
    raw = '설명\n{"a": {"b": [1, 2]}}\n끝'
    assert _parse(raw) == {"a": {"b": [1, 2]}}


def test_korean_values_are_preserved():
    assert _parse('{"label": "할인 문구"}') == {"label": "할인 문구"}


# ── 실패 ─────────────────────────────────────────────────────────────────────


def test_no_json_at_all_raises_the_injected_error():
    with pytest.raises(Boom, match="JSON을 찾을 수 없습니다"):
        _parse("죄송합니다. 분석할 수 없습니다.")


def test_truncated_json_is_reported_as_truncated():
    """출력 한도에 걸려 잘린 응답 — 원인을 구분해 알려야 고칠 수 있다.

    중첩 구조가 있으면 닫는 괄호가 일부 남아 중괄호 범위는 잡히지만 파싱은 실패한다.
    그 경우를 "찾을 수 없음"이 아니라 "잘림"으로 알려야 출력 한도를 의심할 수 있다.
    """
    with pytest.raises(Boom, match="잘려 파싱할 수 없습니다"):
        _parse('{"headings": [{"id": 1, "text": "아주 긴 문구"}')


def test_response_without_any_braces_is_reported_as_not_found():
    """괄호가 아예 없으면 잘린 게 아니라 JSON 이 아닌 응답이다 — 원인이 다르다."""
    with pytest.raises(Boom, match="JSON을 찾을 수 없습니다"):
        _parse('{"headings": [{"id": 1, "text": "아주 긴 문구')


def test_a_json_array_is_rejected():
    """호출부는 dict 를 기대한다 — 배열이 오면 형식 오류로 걸러야 한다."""
    with pytest.raises(Boom, match="형식이 예상과 다릅니다"):
        _parse("[1, 2, 3]")


def test_a_json_scalar_is_rejected():
    with pytest.raises(Boom, match="형식이 예상과 다릅니다"):
        _parse('"그냥 문자열"')


def test_empty_response_is_rejected():
    with pytest.raises(Boom):
        _parse("")


# ── 오류 메시지 ──────────────────────────────────────────────────────────────


def test_error_includes_the_response_so_it_can_be_diagnosed():
    with pytest.raises(Boom, match="무슨 말인지 모를 응답"):
        _parse("무슨 말인지 모를 응답")


def test_excerpt_limits_how_much_is_echoed():
    """응답 전체를 로그·화면에 쏟으면 읽을 수 없다."""
    with pytest.raises(Boom) as exc:
        _parse("가" * 500, excerpt=50)

    # 잘라낸 길이 + 따옴표 + 안내 문구 — 원문 500자가 그대로 실리지는 않는다
    assert len(str(exc.value)) < 200


def test_the_injected_error_type_is_used():
    class Other(Exception):
        pass

    with pytest.raises(Other):
        parse_json_object("없음", error=Other)
