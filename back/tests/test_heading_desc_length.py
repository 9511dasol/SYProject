"""문구 추천 내용(desc) 길이 보정.

의뢰자 요청은 "85자 정도, 유연하게". 프롬프트로 목표를 주되 모델이 한글 글자 수를
세지 못해 같은 지시로도 평균이 78~121자까지 흔들리므로, 눈에 띄게 긴 것만 문장
경계에서 줄인다. 문장 중간을 자르면 어색해지므로 그런 일은 절대 없어야 한다.
"""

import json

import pytest

from app.services.heading_service import (
    _DESC_MAX,
    _DESC_MIN_AFTER_TRIM,
    _fit_desc,
    _parse_response,
)

# 실제 모델 출력을 본뜬 한 문장짜리 조각들 (뒤의 숫자가 글자 수)
S_44 = "이미지의 50% 할인 문구를 전면에 내세워 가격에 민감한 수험생을 겨냥했습니다."
S_34 = "짧고 강한 표현이라 피드를 넘기다가도 시선을 멈추게 만듭니다."
S_94 = (
    "이미지 속 'D-7'과 '50% OFF - EARLY BIRD'를 결합하여 긴급성과 큰 할인 혜택을 "
    "모두 강조하면서 빠르게 결정해야 하는 수험생을 정확히 타겟팅했습니다."
)
S_10 = "짧은 도입부입니다."


def test_fixture_lengths_are_what_the_tests_assume():
    """아래 테스트들이 이 길이를 전제로 하므로 어긋나면 먼저 여기서 잡는다."""
    assert (len(S_44), len(S_34), len(S_94), len(S_10)) == (44, 34, 94, 10)


def test_desc_near_the_target_is_left_alone():
    """85자 내외는 그대로 둔다 — 자연스러운 문장을 건드릴 이유가 없다."""
    desc = f"{S_44} {S_34}"
    assert len(desc) == 79
    assert _fit_desc(desc) == desc


def test_desc_at_the_cap_is_left_alone():
    filler = "가" * (_DESC_MAX - len(S_44) - 1)
    desc = f"{S_44} {filler}"
    assert len(desc) == _DESC_MAX
    assert _fit_desc(desc) == desc


def test_overlong_desc_is_cut_back_to_whole_sentences():
    """두 문장이 합쳐 한도를 넘으면 앞 문장만 남긴다."""
    desc = f"{S_94} {S_34}"
    assert len(desc) == 129 > _DESC_MAX

    assert _fit_desc(desc) == S_94


def test_trimmed_desc_never_ends_mid_sentence():
    assert _fit_desc(f"{S_94} {S_34}").endswith("다.")


def test_three_sentences_keep_as_many_as_fit():
    desc = f"{S_44} {S_34} {S_34}"
    assert len(desc) == 114 > _DESC_MAX

    result = _fit_desc(desc)
    assert result == f"{S_44} {S_34}"
    assert len(result) <= _DESC_MAX


def test_single_overlong_sentence_is_kept_as_is():
    """자를 지점이 없으면 원문을 그대로 둔다 — 문장 중간을 자르는 것보다 낫다."""
    desc = "가" * 200
    assert _fit_desc(desc) == desc


def test_trim_is_skipped_when_the_remainder_would_be_too_short():
    """앞 문장이 짧으면 잘라봐야 알맹이가 사라진다 — 차라리 긴 원문을 쓴다."""
    long_sentence = "이" * 100 + "."
    desc = f"{S_10} {long_sentence}"
    assert len(desc) > _DESC_MAX
    assert len(S_10) < _DESC_MIN_AFTER_TRIM

    assert _fit_desc(desc) == desc


def test_surrounding_whitespace_is_stripped():
    assert _fit_desc(f"  {S_44} {S_34}  ") == f"{S_44} {S_34}"


def test_parse_response_applies_the_length_fix():
    """파싱을 지나고 나면 길이 보정이 이미 적용돼 있어야 한다."""
    payload = json.dumps({
        "headings": [
            {"id": 1, "platform": "Instagram", "text": "테스트 문구", "desc": f"{S_94} {S_34}"}
        ]
    })

    result = _parse_response(payload)
    assert result.headings[0].desc == S_94


@pytest.mark.parametrize(("count", "expected_len"), [(1, 44), (2, 89), (3, 89)])
def test_repeated_sentences_are_trimmed_to_fit(count, expected_len):
    """한 문장만 있으면 원문 유지, 여러 문장이면 한도 안까지만 남는다."""
    result = _fit_desc(" ".join([S_44] * count))
    assert len(result) == expected_len
