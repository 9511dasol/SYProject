"""순위 데이터 공급자 추상화.

순위를 어디서 얻든(보고서 업로드 → M2에서 네이버 검색광고 API) 상위 로직
(적재·이탈 판정·알림)은 같아야 한다. 공급자는 RankObservation 목록만 내놓고,
그 뒤는 rank_monitor_service 가 공통으로 처리한다.

LLM(AbstractLLMClient)·메일(AbstractMailSender)과 같은 패턴이다.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class RankObservation:
    """키워드 하루치 관측값 — 공급자가 무엇이든 이 모양으로 수렴한다."""

    keyword: str
    device: str  # "all" | "pc" | "mobile"
    stat_date: date
    avg_rank: float | None  # None = 노출 없음
    impressions: int = 0
    clicks: int = 0


class RankProviderError(Exception):
    """공급자 실패 — 원인 코드를 함께 담아 감시 행에 그대로 기록할 수 있게 한다.

    코드 체계(예: AUTH_ERROR / KEYWORD_NOT_FOUND / QUOTA_EXCEEDED / PROVIDER_DOWN)는
    M2 API 공급자에서 채워진다. "오류"로 뭉뚱그리면 사용자가 스스로 해결할 수 없다.
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class AbstractRankProvider(ABC):
    @abstractmethod
    def fetch(self, target_date: date) -> list[RankObservation]:
        """해당 날짜의 관측값을 돌려준다. 실패 시 RankProviderError를 raise한다."""
