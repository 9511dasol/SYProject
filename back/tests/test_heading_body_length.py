"""문구 추천 본문(body) 길이 보정.

2026-11-27 고객사 제보로 두 번째 필드가 "추천 이유"에서 "본문 카피"로 바뀌었다.
길이 규칙도 함께 바뀌었다 — 예전에는 세 매체 모두 85자 한 기준이었지만, 지금은
쓰임이 달라(피드 캡션 / 검색 도입 문단 / 설명란 두 줄) 매체마다 한도가 다르다.

바뀌지 않은 원칙: 모델이 한글 글자 수를 세지 못해 분량이 흔들리므로 눈에 띄게 긴
것만 문장 경계에서 줄인다. **문장 중간을 자르는 일은 절대 없어야 한다.**
"""

import json

import pytest

from app.services.heading_service import (
    _BODY_MIN_AFTER_TRIM,
    _PLATFORM_SPECS,
    _fit_body,
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

IG_MAX = _PLATFORM_SPECS["Instagram"].body_max


def test_fixture_lengths_are_what_the_tests_assume():
    """아래 테스트들이 이 길이를 전제로 하므로 어긋나면 먼저 여기서 잡는다."""
    assert (len(S_44), len(S_34), len(S_94), len(S_10)) == (44, 34, 94, 10)


# ── 한도 안은 손대지 않는다 ───────────────────────────────────────────────────

def test_body_within_the_cap_is_left_alone():
    body = f"{S_44} {S_34}"
    assert len(body) == 79 <= IG_MAX
    assert _fit_body(body, IG_MAX) == body


def test_body_exactly_at_the_cap_is_left_alone():
    filler = "가" * (IG_MAX - len(S_44) - 1)
    body = f"{S_44} {filler}"
    assert len(body) == IG_MAX
    assert _fit_body(body, IG_MAX) == body


# ── 넘치면 문장 단위로만 줄인다 ──────────────────────────────────────────────

def test_overlong_body_is_cut_back_to_whole_sentences():
    body = f"{S_94} {S_44} {S_34}"
    assert len(body) == 174 > IG_MAX

    assert _fit_body(body, IG_MAX) == f"{S_94} {S_44}"


def test_trimmed_body_never_ends_mid_sentence():
    assert _fit_body(f"{S_94} {S_44} {S_34}", IG_MAX).endswith("다.")


def test_single_overlong_sentence_is_kept_as_is():
    """자를 지점이 없으면 원문을 그대로 둔다 — 문장 중간을 자르는 것보다 낫다."""
    body = "가" * 300
    assert _fit_body(body, IG_MAX) == body


def test_trim_is_skipped_when_the_remainder_would_be_too_short():
    """앞 문장이 짧으면 잘라봐야 알맹이가 사라진다 — 차라리 긴 원문을 쓴다."""
    long_sentence = "이" * 200 + "."
    body = f"{S_10} {long_sentence}"
    assert len(body) > IG_MAX
    assert len(S_10) < _BODY_MIN_AFTER_TRIM

    assert _fit_body(body, IG_MAX) == body


def test_surrounding_whitespace_is_stripped():
    assert _fit_body(f"  {S_44} {S_34}  ", IG_MAX) == f"{S_44} {S_34}"


# ── 매체마다 한도가 다르다 ───────────────────────────────────────────────────

def test_each_platform_has_its_own_cap():
    """유튜브 설명란 두 줄과 블로그 도입 문단을 같은 자로 재면 한쪽이 어색해진다."""
    caps = {name: spec.body_max for name, spec in _PLATFORM_SPECS.items()}
    assert caps["YouTube"] < caps["Instagram"] < caps["Blog"]


def test_the_same_body_is_trimmed_for_youtube_but_kept_for_blog():
    body = f"{S_94} {S_34}"
    assert len(body) == 129

    yt = _PLATFORM_SPECS["YouTube"].body_max
    blog = _PLATFORM_SPECS["Blog"].body_max
    assert len(body) > yt and len(body) <= blog

    assert _fit_body(body, yt) == S_94       # 유튜브는 두 줄 안에 들어가야 한다
    assert _fit_body(body, blog) == body     # 블로그 도입 문단으로는 적정 분량


# ── 해시태그 줄 (인스타그램) ─────────────────────────────────────────────────

def test_hashtag_line_survives_when_the_prose_is_trimmed():
    """산문이 잘려도 해시태그는 남아야 한다.

    해시태그는 분량이 아니라 검색 유입 장치이고, 프롬프트도 "60~120자 범위에
    포함하지 않는다"고 지시한다. 포함해서 재면 여유가 30자뿐이라 해시태그 5개가
    통째로 사라졌다 — 모델은 지시대로 답했는데 보정이 조용히 지우는 상태였다.
    """
    body = f"{S_94} {S_44} {S_34}\n#수능 #인강할인 #수험생"
    result = _fit_body(body, IG_MAX)

    assert result == f"{S_94} {S_44}\n#수능 #인강할인 #수험생"
    assert "#수능 #인강할인 #수험생" in result     # 해시태그는 그대로
    assert S_34 not in result                      # 산문만 잘렸다


def test_cap_measures_prose_only_not_hashtags():
    """한도는 산문만 재야 한다 — 프롬프트 상한대로 답해도 잘리지 않는다.

    프롬프트가 허용한 본문 상한(120자)에 해시태그 5개(30자를 쉽게 넘는다)를 붙이면
    합계가 한도를 넘는다. 해시태그를 길이에 넣으면 바로 이 정상 응답이 깎인다.
    """
    prose = "가" * (IG_MAX - 10) + "."          # 한도 안에 드는 산문
    hashtags = "#수능대비 #인강할인 #고3수험생 #내신대비 #전과목패키지"
    body = f"{prose}\n{hashtags}"

    assert len(body) > IG_MAX                    # 합계로 재면 초과다
    assert _fit_body(body, IG_MAX) == body       # 산문으로 재면 손대지 않는다


def test_hashtags_inside_a_sentence_are_not_split_off():
    """문장 안에 섞인 해시태그는 본문의 일부다 — 마지막 줄만 떼어 낸다."""
    body = f"{S_44} #할인 중입니다. {S_34}"
    assert _fit_body(body, IG_MAX) == body


def test_hashtag_line_survives_when_the_whole_body_fits():
    body = f"{S_44} {S_34}\n#수능 #인강할인"
    assert len(body) <= IG_MAX
    assert _fit_body(body, IG_MAX) == body


# ── 파싱 경로 ────────────────────────────────────────────────────────────────

def _payload(**overrides) -> str:
    item = {"id": 1, "platform": "Instagram", "text": "테스트 문구", "body": f"{S_44} {S_34}"}
    item.update(overrides)
    return json.dumps({"headings": [item]}, ensure_ascii=False)


def test_parse_response_applies_the_length_fix_per_platform():
    """파싱을 지나고 나면 그 매체의 한도가 이미 적용돼 있어야 한다."""
    result = _parse_response(_payload(body=f"{S_94} {S_44} {S_34}"))
    assert result.headings[0].body == f"{S_94} {S_44}"


@pytest.mark.parametrize("bad", [None, "", "   ", 123])
def test_parse_rejects_items_without_a_body(bad):
    """본문 없는 문구는 쓸 데가 없다 — 성공으로 넘기지 말고 재시도로 이어져야 한다."""
    with pytest.raises(RuntimeError):
        _parse_response(_payload(body=bad))


def test_parse_rejects_the_old_desc_only_shape():
    """추천 이유만 돌아오던 옛 응답 형태도 여기서 걸린다."""
    raw = json.dumps(
        {"headings": [{"id": 1, "platform": "Blog", "text": "제목", "desc": "추천 이유"}]},
        ensure_ascii=False,
    )
    with pytest.raises(RuntimeError):
        _parse_response(raw)
