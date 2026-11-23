"""키워드 경쟁 지표 (M6) — 이 키워드가 얼마나 치열한가.

순위 모니터링이 "무슨 일이 있었나", 예상 입찰가가 "얼마가 드나"에 답한다면,
여기서는 **"왜 그 값이 나오는가"** 를 보여 준다. 목표를 1위로 잡는 게 무리인지
아닌지는 검색량과 경쟁 밀도를 봐야 판단할 수 있다.

경쟁사가 '누구인지'는 다루지 않는다
──────────────────────────────────
그건 검색결과 화면을 수집해야 알 수 있고, 매체 약관 위반 소지가 있어 쓰지 않는다.
대신 공식 키워드 도구가 주는 **평균 노출 광고 수(plAvgDepth)** 로 "몇 개 업체가
붙어 있는지"를, **경쟁정도(compIdx)** 로 매체의 자체 판정을 보여 준다.

API 로 확인한 주의점
──────────────────
검색량이 적은 키워드는 숫자가 아니라 문자열 `"< 10"` 으로 온다. 그대로 int() 하면
터지므로, 숫자가 아닌 값은 "10 미만"이라는 뜻으로 따로 표시한다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.services.rank.naver_client import NaverSearchAdClient
from app.services.rank.report_parser import normalize_keyword

logger = logging.getLogger(__name__)


@dataclass
class KeywordInsight:
    keyword: str
    # 월간 검색 수. 매체가 "< 10" 으로 뭉뚱그린 경우 None + is_low_volume=True
    monthly_pc: int | None = None
    monthly_mobile: int | None = None
    pc_low_volume: bool = False
    mobile_low_volume: bool = False
    # 매체의 경쟁정도 판정 — "높음" | "중간" | "낮음"
    competition: str | None = None
    # 평균 노출 광고 수 — 이 키워드에 평균 몇 개 광고가 붙는지
    ad_depth: int | None = None
    # 월평균 클릭률(%) — 노출 대비 실제 유입 기대치
    ctr_pc: float | None = None
    ctr_mobile: float | None = None

    @property
    def monthly_total(self) -> int | None:
        """PC+모바일 합계. 한쪽이라도 '10 미만'이면 합계를 말할 수 없다."""
        if self.monthly_pc is None or self.monthly_mobile is None:
            return None
        return self.monthly_pc + self.monthly_mobile


def _parse_count(value) -> tuple[int | None, bool]:
    """(숫자, 10미만여부). 매체가 '< 10' 으로 주는 경우를 구분한다."""
    if isinstance(value, (int, float)):
        return int(value), False
    text = str(value or "").strip()
    if not text:
        return None, False
    if text.startswith("<"):
        return None, True
    try:
        return int(float(text.replace(",", ""))), False
    except ValueError:
        return None, False


def _parse_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class KeywordInsightService:
    def __init__(self, client: NaverSearchAdClient | None = None):
        self.client = client or NaverSearchAdClient()

    @property
    def is_configured(self) -> bool:
        return self.client.is_configured

    def fetch(self, keyword: str) -> KeywordInsight | None:
        """해당 키워드의 지표. 매체가 그 키워드를 모르면 None.

        키워드 도구는 연관 키워드를 함께 돌려주므로, 그중 **요청한 키워드와 같은
        것**만 골라낸다(띄어쓰기·대소문자는 무시하고 비교한다).
        """
        rows = self.client.keyword_tool(keyword)
        wanted = normalize_keyword(keyword)
        row = next(
            (r for r in rows if normalize_keyword(r.get("relKeyword")) == wanted), None
        )
        if row is None:
            return None

        pc, pc_low = _parse_count(row.get("monthlyPcQcCnt"))
        mobile, mobile_low = _parse_count(row.get("monthlyMobileQcCnt"))
        return KeywordInsight(
            keyword=keyword,
            monthly_pc=pc,
            monthly_mobile=mobile,
            pc_low_volume=pc_low,
            mobile_low_volume=mobile_low,
            competition=row.get("compIdx") or None,
            ad_depth=_parse_int(row.get("plAvgDepth")),
            ctr_pc=_parse_float(row.get("monthlyAvePcCtr")),
            ctr_mobile=_parse_float(row.get("monthlyAveMobileCtr")),
        )
