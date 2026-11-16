"""이미지 요소 분석 — Gemini 응답 파싱의 견고성.

모델 응답은 형식이 흔들린다(코드펜스, 좌표 범위 초과, 뒤집힌 박스). 파싱이
이런 변형을 조용히 걸러내고, 좌표를 0~1 비율로 정확히 변환하는지 본다.
"""

import pytest

from app.services.image_element_service import ImageAnalyzeError, _parse_response


def test_parses_boxes_into_fractions():
    raw = '{"elements": [{"id": 1, "label": "헤드라인", "category": "text", "box_2d": [100, 200, 300, 800]}]}'

    analysis = _parse_response(raw)

    el = analysis.elements[0]
    assert el.label == "헤드라인"
    # box_2d 는 [ymin, xmin, ymax, xmax] 0~1000 → x/y/w/h 0~1
    assert el.box.x == pytest.approx(0.2)
    assert el.box.y == pytest.approx(0.1)
    assert el.box.w == pytest.approx(0.6)
    assert el.box.h == pytest.approx(0.2)


def test_strips_markdown_fences():
    raw = '```json\n{"elements": [{"id": 1, "label": "로고", "category": "logo", "box_2d": [0, 0, 100, 100]}]}\n```'
    assert _parse_response(raw).elements[0].label == "로고"


def test_skips_malformed_boxes_but_keeps_valid_ones():
    raw = (
        '{"elements": ['
        '{"id": 1, "label": "뒤집힌 박스", "category": "text", "box_2d": [500, 500, 100, 100]},'
        '{"id": 2, "label": "좌표 누락", "category": "text", "box_2d": [1, 2]},'
        '{"id": 3, "label": "정상", "category": "product", "box_2d": [0, 0, 1000, 1000]}'
        ']}'
    )

    analysis = _parse_response(raw)

    assert [e.label for e in analysis.elements] == ["정상"]
    # id 는 응답 배열에서의 위치 기준 — 걸러진 항목도 자리를 차지한다
    assert analysis.elements[0].id == 3


def test_out_of_range_coords_are_clamped():
    raw = '{"elements": [{"id": 1, "label": "밖으로 나감", "category": "other", "box_2d": [-50, 0, 1200, 1000]}]}'

    box = _parse_response(raw).elements[0].box
    assert box.y == 0.0
    assert box.h == pytest.approx(1.0)


def test_no_valid_elements_raises():
    with pytest.raises(ImageAnalyzeError):
        _parse_response('{"elements": []}')


def test_non_json_raises():
    with pytest.raises(ImageAnalyzeError):
        _parse_response("죄송합니다, 분석할 수 없습니다.")
