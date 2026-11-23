"""순위별 예상 입찰가(M5) — 요청 모양과 디바이스 분리를 고정한다.

네트워크는 쓰지 않는다. 실제 API 로 확인한 요청·응답 모양을 가짜 클라이언트로 재현한다.
"""

import pytest

from app.services.rank.base import RankProviderError
from app.services.rank.bid_estimate import MAX_POSITION, BidEstimateService
from app.services.rank.naver_client import ERR_QUOTA


class FakeClient:
    """{디바이스: {순위: 입찰가}} 를 받아 실제 응답 모양으로 돌려준다."""

    is_configured = True

    def __init__(self, bids=None, fail=None):
        self.calls: list[dict] = []
        self._bids = bids or {"PC": {1: 1610, 2: 1500, 3: 1490}, "MOBILE": {1: 2430, 2: 2030, 3: 1740}}
        self._fail = fail

    def post(self, path, body):
        if self._fail:
            raise self._fail
        self.calls.append(body)
        device = body["device"]
        table = self._bids.get(device, {})
        return {
            "device": device,
            "estimate": [
                {"keyword": item["key"], "position": item["position"],
                 "bid": table.get(item["position"])}
                for item in body["items"]
                if table.get(item["position"]) is not None
            ],
        }


def _service(client):
    return BidEstimateService(client=client)


def test_all_device_queries_both_and_keeps_them_separate():
    """PC 와 모바일은 입찰가 차이가 커서 하나로 합치면 안 된다."""
    client = FakeClient()
    result = _service(client).estimate("수학과편입", device="all", max_position=3)

    assert [c["device"] for c in client.calls] == ["PC", "MOBILE"]
    assert len(result.rows) == 3
    first = result.rows[0]
    assert first.position == 1 and first.pc == 1610 and first.mobile == 2430


@pytest.mark.parametrize("device,expected", [("pc", ["PC"]), ("mobile", ["MOBILE"])])
def test_single_device_queries_only_that_device(device, expected):
    client = FakeClient()
    result = _service(client).estimate("수학과편입", device=device, max_position=2)

    assert [c["device"] for c in client.calls] == expected
    row = result.rows[0]
    if device == "pc":
        assert row.pc == 1610 and row.mobile is None
    else:
        assert row.mobile == 2430 and row.pc is None


def test_request_body_matches_api_contract():
    client = FakeClient()
    _service(client).estimate("마케팅자동화", device="pc", max_position=3)

    body = client.calls[0]
    assert body["device"] == "PC"
    assert body["items"] == [
        {"key": "마케팅자동화", "position": 1},
        {"key": "마케팅자동화", "position": 2},
        {"key": "마케팅자동화", "position": 3},
    ]


def test_position_is_capped_at_api_limit():
    """11위를 넣으면 API 가 요청 전체를 거부한다 — 상한을 넘겨 보내지 않는다."""
    client = FakeClient()
    result = _service(client).estimate("수학과편입", device="pc", max_position=99)

    positions = [item["position"] for item in client.calls[0]["items"]]
    assert positions[-1] == MAX_POSITION
    assert len(result.rows) == MAX_POSITION


def test_position_floor_is_one():
    client = FakeClient()
    _service(client).estimate("수학과편입", device="pc", max_position=0)
    assert client.calls[0]["items"] == [{"key": "수학과편입", "position": 1}]


def test_missing_positions_stay_empty_not_zero():
    """응답에 없는 순위를 0원으로 채우면 '공짜'로 읽힌다."""
    client = FakeClient(bids={"PC": {1: 1610}})
    result = _service(client).estimate("수학과편입", device="pc", max_position=3)

    assert result.rows[0].pc == 1610
    assert result.rows[1].pc is None and result.rows[2].pc is None


def test_api_failure_propagates_as_provider_error():
    client = FakeClient(fail=RankProviderError(ERR_QUOTA, "한도 초과"))
    with pytest.raises(RankProviderError) as exc:
        _service(client).estimate("수학과편입", device="pc")
    assert exc.value.code == ERR_QUOTA
