"""순위별 예상 입찰가 조회 (M5).

순위 모니터링이 "무슨 일이 있었나"에 답한다면, 이쪽은 "그래서 얼마가 드나"에 답한다.
목표를 3위로 잡아 둔 키워드가 실제로 얼마짜리인지 모르면 목표를 정할 근거가 없다.

API 로 확인한 사실 (실제 계정 측정)
──────────────────────────────────
- POST /estimate/average-position-bid/keyword
  요청 {"device": "PC"|"MOBILE", "items":[{"key": 키워드, "position": 순위}]}
  응답 {"device": ..., "estimate":[{"keyword":..., "position":..., "bid": 원}]}
- 조회 가능한 순위는 **1~10위**다. 11위를 넣으면 요청 전체가 거부된다.
- PC 와 모바일의 입찰가는 크게 다르다(측정 예: 1위 PC 1,610원 / 모바일 2,430원).
  그래서 디바이스를 묶어 하나로 보여 주지 않는다.
- 검색량이 거의 없는 키워드도 최소 입찰가(70원)를 돌려준다 — 값이 왔다고 해서
  그 키워드에 수요가 있다는 뜻은 아니다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.services.rank.naver_client import NaverSearchAdClient

logger = logging.getLogger(__name__)

MAX_POSITION = 10
_PATH = "/estimate/average-position-bid/keyword"

# 감시의 device 값 → API 가 받는 디바이스 코드
_DEVICE_CODES = {"pc": ("PC",), "mobile": ("MOBILE",), "all": ("PC", "MOBILE")}
_DEVICE_KEY = {"PC": "pc", "MOBILE": "mobile"}


@dataclass
class BidRow:
    position: int
    pc: int | None = None
    mobile: int | None = None


@dataclass
class BidEstimate:
    keyword: str
    rows: list[BidRow] = field(default_factory=list)


class BidEstimateService:
    def __init__(self, client: NaverSearchAdClient | None = None):
        self.client = client or NaverSearchAdClient()

    @property
    def is_configured(self) -> bool:
        return self.client.is_configured

    def estimate(
        self, keyword: str, device: str = "all", max_position: int = 5
    ) -> BidEstimate:
        """1위부터 max_position 위까지의 예상 입찰가.

        디바이스별로 한 번씩 호출한다 — API 가 요청 하나에 한 디바이스만 받는다.
        """
        top = max(1, min(max_position, MAX_POSITION))
        positions = list(range(1, top + 1))
        by_position: dict[int, BidRow] = {p: BidRow(position=p) for p in positions}

        for code in _DEVICE_CODES.get(device, _DEVICE_CODES["all"]):
            body = {
                "device": code,
                "items": [{"key": keyword, "position": p} for p in positions],
            }
            payload = self.client.post(_PATH, body)
            for item in payload.get("estimate", []):
                row = by_position.get(item.get("position"))
                if row is None:
                    continue
                setattr(row, _DEVICE_KEY[code], item.get("bid"))

        return BidEstimate(keyword=keyword, rows=[by_position[p] for p in positions])
