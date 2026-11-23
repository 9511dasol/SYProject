"""네이버 검색광고 API 에서 키워드 순위를 읽어 온다.

업로드 경로와 같은 모양(RankObservation)으로 수렴시키는 것이 목적이다. 그래야
적재·판정·알림이 "데이터가 어디서 왔는지"를 몰라도 되고, 실제로 M1 에서 만든
ingest_observations 를 그대로 재사용한다.

이 API 를 쓰며 확인한 제약 (실제 계정으로 측정)
──────────────────────────────────────────────
- 순위(avgRnk)는 **전일까지 확정된 일 단위 평균**이다. 분 단위 실시간 순위는 없다.
- 디바이스 분리(breakdown=pcMblTp)는 **최근 7일 이내**만 허용된다
  ("상세 데이터는 최근 7일 이내 기간에서만 사용 가능합니다"). 그보다 과거를 받을
  때는 분리를 포기하고 합산값(device="all")으로 받는다.
- 디바이스 라벨은 "PC" 와 "모바일" 이다.
- 키워드 ID 는 계정 전체를 훑어야 얻는다 — 광고그룹 하나당 한 번씩 호출해야 해서
  (측정한 계정은 광고그룹 330개) 매번 다시 찾지 않고 감시 행에 저장해 재사용한다.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from app.core.settings import settings
from app.services.rank.base import RankObservation, RankProviderError
from app.services.rank.naver_client import ERR_BAD_REQUEST, NaverSearchAdClient
from app.services.rank.report_parser import normalize_keyword

logger = logging.getLogger(__name__)

_STATS_FIELDS = ["impCnt", "clkCnt", "avgRnk"]
_DEVICE_BY_LABEL = {"PC": "pc", "모바일": "mobile", "MOBILE": "mobile"}


def _device_of(label: str | None) -> str:
    if not label:
        return "all"
    return _DEVICE_BY_LABEL.get(label.strip().upper(), _DEVICE_BY_LABEL.get(label.strip(), "all"))


def _as_rank(value) -> float | None:
    """avgRnk → float. 0 이나 빈 값은 '노출 없음'이다(순위는 1부터)."""
    try:
        rank = float(value)
    except (TypeError, ValueError):
        return None
    return rank if rank > 0 else None


def _as_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


class NaverRankProvider:
    """감시 중인 키워드에 한해 순위를 받아 온다.

    계정의 모든 키워드를 받지 않는 이유: 통계 호출이 키워드 수에 비례하는데,
    감시하지 않는 키워드의 순위는 어디에도 쓰이지 않는다.
    """

    def __init__(self, client: NaverSearchAdClient | None = None):
        self.client = client or NaverSearchAdClient()

    @property
    def is_configured(self) -> bool:
        return self.client.is_configured

    # ── 키워드 ID 해석 ────────────────────────────────────────────────────────

    def build_keyword_index(self) -> dict[str, list[str]]:
        """계정을 훑어 {정규화 키워드: [광고 키워드 ID…]} 를 만든다.

        광고그룹 수만큼 호출하므로 느리다(측정: 330개 ≈ 1분). 호출부가 결과를
        저장해 두고 재사용하는 것을 전제로 한다.

        일시정지된 캠페인은 건너뛴다 — 노출되지 않으므로 순위도 나오지 않는다.
        """
        index: dict[str, list[str]] = {}
        campaigns = [c for c in self.client.campaigns() if not c.get("userLock")]
        logger.info("네이버 키워드 색인 생성 시작 — 캠페인 %d개", len(campaigns))

        adgroup_count = 0
        for campaign in campaigns:
            for group in self.client.adgroups(campaign["nccCampaignId"]):
                if group.get("userLock"):
                    continue
                adgroup_count += 1
                for keyword in self.client.keywords(group["nccAdgroupId"]):
                    text = normalize_keyword(keyword.get("keyword"))
                    if not text:
                        continue
                    index.setdefault(text, []).append(keyword["nccKeywordId"])

        logger.info(
            "네이버 키워드 색인 완료 — 광고그룹 %d개, 고유 키워드 %d개",
            adgroup_count, len(index),
        )
        return index

    # ── 순위 조회 ─────────────────────────────────────────────────────────────

    def fetch_for_ids(
        self, keyword_ids: list[str], target_date: date
    ) -> dict[str, list[dict]]:
        """{키워드 ID: [{device, avg_rank, impressions, clicks}…]}.

        디바이스 분리가 가능한 기간이면 PC·모바일을 나눠 받고, 아니면 합산만 받는다.

        허용 기간은 두 겹으로 다룬다. 날짜 비교(설정값)는 뻔히 실패할 호출을
        안 보내는 최적화일 뿐이고, 실제 판정은 매체의 응답이다 — 분리 조회가
        거부되면("상세 데이터는 최근 7일 이내…") 그 자리에서 합산 조회로 전환한다.
        매체가 창을 조이거나 넓혀도 수집은 멈추지 않고, 설정이 낡아도 틀리지 않는다.
        """
        if not keyword_ids:
            return {}

        day = target_date.isoformat()
        use_breakdown = (
            (date.today() - target_date)
            <= timedelta(days=settings.NAVER_BREAKDOWN_MAX_AGE_DAYS)
        )
        result: dict[str, list[dict]] = {}
        chunk_size = settings.NAVER_STATS_CHUNK

        for start in range(0, len(keyword_ids), chunk_size):
            chunk = keyword_ids[start : start + chunk_size]
            try:
                rows = self.client.stats(
                    chunk,
                    _STATS_FIELDS,
                    day,
                    day,
                    breakdown="pcMblTp" if use_breakdown else None,
                )
            except RankProviderError as exc:
                if not (use_breakdown and exc.code == ERR_BAD_REQUEST):
                    raise
                # 분리 조회가 거부당했다 — 허용 창 밖이다. 남은 청크까지 전부
                # 합산으로 내려 디바이스 구분만 포기하고 수집은 계속한다.
                logger.info(
                    "디바이스 분리 조회 거부(%s) — 합산 조회로 전환합니다", target_date
                )
                use_breakdown = False
                rows = self.client.stats(chunk, _STATS_FIELDS, day, day, breakdown=None)
            for row in rows:
                entries = result.setdefault(row.get("id"), [])
                breakdowns = row.get("breakdowns") if use_breakdown else None
                if breakdowns:
                    for part in breakdowns:
                        entries.append({
                            "device": _device_of(part.get("name")),
                            "avg_rank": _as_rank(part.get("avgRnk")),
                            "impressions": _as_int(part.get("impCnt")),
                            "clicks": _as_int(part.get("clkCnt")),
                        })
                else:
                    entries.append({
                        "device": "all",
                        "avg_rank": _as_rank(row.get("avgRnk")),
                        "impressions": _as_int(row.get("impCnt")),
                        "clicks": _as_int(row.get("clkCnt")),
                    })
        return result

    def observations_for(
        self,
        keyword_to_ids: dict[str, list[str]],
        target_date: date,
    ) -> list[RankObservation]:
        """{감시 키워드(원문): [ID…]} → 관측값 목록.

        같은 키워드가 여러 광고그룹에 있으면 노출수 가중 평균으로 합친다 — 노출
        10회짜리와 10,000회짜리의 순위를 같은 무게로 평균 내면 실제와 동떨어진다.
        (업로드 파서와 같은 규칙이다.)

        통계가 한 줄도 안 온 키워드는 **노출 0으로 확정**해 기록을 남긴다.
        보고서 업로드와 달리 여기서는 "우리가 그 키워드를 콕 집어 물어봤는데 답이
        없었다"는 뜻이라, 빠진 것인지 노출이 없었던 것인지 헷갈릴 여지가 없다.
        그래야 '노출 없음도 이탈로 본다' 설정이 실제로 동작한다.
        """
        all_ids = [i for ids in keyword_to_ids.values() for i in ids]
        by_id = self.fetch_for_ids(list(dict.fromkeys(all_ids)), target_date)

        observations: list[RankObservation] = []
        for keyword, ids in keyword_to_ids.items():
            # device -> [노출합, 클릭합, rank*imp 가중합, rank 있는 행의 imp 합]
            merged: dict[str, list[float]] = {}
            for keyword_id in ids:
                for entry in by_id.get(keyword_id, []):
                    acc = merged.setdefault(entry["device"], [0, 0, 0.0, 0])
                    acc[0] += entry["impressions"]
                    acc[1] += entry["clicks"]
                    if entry["avg_rank"] is not None:
                        acc[2] += entry["avg_rank"] * entry["impressions"]
                        acc[3] += entry["impressions"]

            if not merged:
                observations.append(
                    RankObservation(
                        keyword=keyword,
                        device="all",
                        stat_date=target_date,
                        avg_rank=None,
                        impressions=0,
                        clicks=0,
                    )
                )
                continue

            for device, (imp, clk, weighted, weight) in merged.items():
                observations.append(
                    RankObservation(
                        keyword=keyword,
                        device=device,
                        stat_date=target_date,
                        avg_rank=(weighted / weight) if weight > 0 else None,
                        impressions=int(imp),
                        clicks=int(clk),
                    )
                )
        return observations
