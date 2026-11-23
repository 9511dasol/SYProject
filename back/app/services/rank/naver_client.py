"""네이버 검색광고 API 저수준 클라이언트 — 서명·호출·오류 분류만 한다.

순위를 어떻게 해석할지는 naver_provider 가 맡고, 여기서는 "요청이 왜 실패했는지"를
코드로 가려내는 데 집중한다. 실패를 '오류' 하나로 뭉뚱그리면 사용자가 스스로
해결할 수 없다 — 권한이 없는 것과 한도를 넘은 것은 할 일이 전혀 다르다.

서명 규칙
────────
X-Signature = base64(HMAC-SHA256(secret, "{timestamp}.{method}.{path}"))
path 에 쿼리스트링을 넣으면 서명이 어긋난다 — 경로만 쓴다.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from app.core.settings import settings
from app.services.rank.base import RankProviderError

logger = logging.getLogger(__name__)

# 오류 코드 — 감시 행(last_error_code)과 화면 뱃지가 그대로 쓴다.
ERR_NOT_CONFIGURED = "NOT_CONFIGURED"
ERR_AUTH = "AUTH_ERROR"
ERR_QUOTA = "QUOTA_EXCEEDED"
ERR_NOT_FOUND = "NOT_FOUND"
ERR_BAD_REQUEST = "BAD_REQUEST"
ERR_PROVIDER_DOWN = "PROVIDER_DOWN"
# 호출은 성공했지만 광고 계정에 그 키워드가 없는 경우 — 수집기가 붙인다.
ERR_KEYWORD_NOT_FOUND = "KEYWORD_NOT_FOUND"

_MESSAGES = {
    ERR_NOT_CONFIGURED: (
        "네이버 검색광고 API 키가 설정되지 않았습니다 "
        "(NAVER_SEARCHAD_API_KEY / _SECRET_KEY / _CUSTOMER_ID)."
    ),
    ERR_AUTH: (
        "API 인증에 실패했습니다. 액세스 라이선스·비밀키·고객 ID가 서로 맞는지, "
        "해당 계정에 API 사용 권한이 있는지 확인하세요."
    ),
    ERR_QUOTA: "API 호출 한도를 넘었습니다. 잠시 후 다시 시도됩니다.",
    ERR_NOT_FOUND: "요청한 자원을 찾을 수 없습니다 (삭제되었거나 접근 권한이 없습니다).",
    ERR_BAD_REQUEST: "API 요청이 거부되었습니다.",
    ERR_PROVIDER_DOWN: "네이버 광고 API에 연결하지 못했습니다. 잠시 후 다시 시도됩니다.",
    ERR_KEYWORD_NOT_FOUND: (
        "광고 계정에서 이 키워드를 찾지 못했습니다. 철자가 같은지, "
        "해당 키워드의 광고가 내려가 있지는 않은지 확인하세요."
    ),
}


def error_message(code: str) -> str:
    return _MESSAGES.get(code, _MESSAGES[ERR_BAD_REQUEST])


def _classify(status: int) -> str:
    if status in (401, 403):
        return ERR_AUTH
    if status == 429:
        return ERR_QUOTA
    if status == 404:
        return ERR_NOT_FOUND
    if status >= 500:
        return ERR_PROVIDER_DOWN
    return ERR_BAD_REQUEST


class NaverSearchAdClient:
    """읽기 전용 호출만 제공한다 — 이 기능은 광고 설정을 바꾸지 않는다."""

    def __init__(
        self,
        api_key: str | None = None,
        secret_key: str | None = None,
        customer_id: str | None = None,
        base_url: str | None = None,
        timeout: float = 20.0,
        max_retries: int = 2,
    ):
        self._api_key = api_key if api_key is not None else settings.NAVER_SEARCHAD_API_KEY
        self._secret = secret_key if secret_key is not None else settings.NAVER_SEARCHAD_SECRET_KEY
        self._customer = (
            customer_id if customer_id is not None else settings.NAVER_SEARCHAD_CUSTOMER_ID
        )
        self._base = (base_url or settings.NAVER_SEARCHAD_BASE_URL).rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._secret and self._customer)

    def _headers(self, method: str, path: str) -> dict[str, str]:
        timestamp = str(round(time.time() * 1000))
        message = f"{timestamp}.{method}.{path}"
        signature = base64.b64encode(
            hmac.new(
                self._secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
            ).digest()
        ).decode("utf-8")
        return {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": timestamp,
            "X-API-KEY": self._api_key,
            "X-Customer": str(self._customer),
            "X-Signature": signature,
        }

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: Any | None = None,
    ) -> Any:
        """실패하면 코드를 담은 RankProviderError 를 던진다.

        일시적 실패(5xx·한도 초과·네트워크)는 짧게 한 번 더 시도한다 — 하루 한 번
        도는 수집이 네트워크가 잠깐 끊겼다는 이유로 통째로 비는 것을 막는다.
        """
        if not self.is_configured:
            raise RankProviderError(ERR_NOT_CONFIGURED, error_message(ERR_NOT_CONFIGURED))

        url = f"{self._base}{path}"
        last: RankProviderError | None = None

        for attempt in range(self._max_retries + 1):
            try:
                with httpx.Client(timeout=self._timeout) as client:
                    res = client.request(
                        method,
                        url,
                        headers=self._headers(method, path),
                        params=params,
                        json=json_body,
                    )
            except httpx.HTTPError as exc:
                last = RankProviderError(ERR_PROVIDER_DOWN, f"{error_message(ERR_PROVIDER_DOWN)} ({exc})")
            else:
                if res.status_code == 200:
                    return res.json()
                code = _classify(res.status_code)
                detail = res.text[:200].replace("\n", " ")
                last = RankProviderError(code, f"{error_message(code)} [HTTP {res.status_code}] {detail}")
                # 권한·요청 오류는 다시 보내도 같은 답이 온다.
                if code in (ERR_AUTH, ERR_NOT_FOUND, ERR_BAD_REQUEST):
                    raise last

            if attempt < self._max_retries:
                time.sleep(0.5 * (attempt + 1))  # 지수에 가까운 짧은 백오프

        assert last is not None
        raise last

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, json_body: Any) -> Any:
        return self._request("POST", path, json_body=json_body)

    # ── 읽기 전용 조회 ────────────────────────────────────────────────────────

    def campaigns(self) -> list[dict]:
        return self.get("/ncc/campaigns")

    def adgroups(self, campaign_id: str) -> list[dict]:
        return self.get("/ncc/adgroups", {"nccCampaignId": campaign_id})

    def keywords(self, adgroup_id: str) -> list[dict]:
        return self.get("/ncc/keywords", {"nccAdgroupId": adgroup_id})

    def keyword_tool(self, hint_keyword: str) -> list[dict]:
        """키워드 도구 — 월간 검색량·경쟁정도·평균 노출 광고 수.

        경쟁사가 '누구인지'는 공식 API 로 알 수 없지만(검색결과 수집은 약관 문제로
        쓰지 않는다), 그 키워드가 **얼마나 치열한지**는 여기서 알 수 있다.
        """
        body = self.get("/keywordstool", {"hintKeywords": hint_keyword, "showDetail": "1"})
        return body.get("keywordList", []) if isinstance(body, dict) else []

    def stats(
        self,
        ids: list[str],
        fields: list[str],
        since: str,
        until: str,
        breakdown: str | None = None,
    ) -> list[dict]:
        """키워드 다건의 기간 통계. ids 는 호출당 상한이 있어 호출부가 잘라서 넘긴다."""
        params: dict[str, Any] = {
            "ids": ids,
            "fields": json.dumps(fields),
            "timeRange": json.dumps({"since": since, "until": until}),
        }
        if breakdown:
            params["breakdown"] = breakdown
        body = self.get("/stats", params)
        if isinstance(body, dict):
            return body.get("data", [])
        return body or []
