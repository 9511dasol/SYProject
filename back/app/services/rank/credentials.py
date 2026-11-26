"""네이버 광고 API 자격증명의 **소유 기업** 판정 — 테넌트 격리의 안전장치.

지금 키는 서버 환경변수 1벌뿐이고, 그 키는 특정 광고 계정(한 기업) 것이다.
그런데 순위 모니터링은 모든 기업이 쓸 수 있으므로, 아무 보호가 없으면 이렇게 된다:

    B기업(또는 체험 계정)이 키워드를 등록하고 "지금 수집"을 누른다
      → 서버가 **A기업 광고 계정**에 조회를 보낸다
      → B기업 화면에 A기업의 순위·입찰가·경쟁 지표가 뜬다

데이터 테이블은 company_id 로 격리돼 있지만, **외부 계정 연결은 격리된 적이 없다.**
그래서 키를 소유한 기업 외에는 외부 API 경로를 아예 닫는다. 자기 보고서를 올려
순위를 쌓는 경로(업로드)는 외부 호출이 없으므로 그대로 열어 둔다 — 기능을 통째로
막는 게 아니라 "남의 계정을 보는 길"만 막는 것이다.

여기는 **갈아끼울 자리**다. 기업별 자격증명 저장소가 생기면 이 파일의 함수 두 개만
바뀌고 호출부(라우터·수집기·알림)는 그대로다.
    - has_naver_access(): 소유 기업 비교 → 해당 기업의 자격증명 존재 여부
    - naver_scope_company_id(): 소유 기업 고정 → 자격증명을 가진 기업 목록 순회
"""

from __future__ import annotations

import logging

from app.core.settings import settings

logger = logging.getLogger(__name__)

# 화면·응답에 그대로 나가는 안내. "안 된다"가 아니라 "왜 안 되고 무엇을 할 수 있는지"를 적는다.
NO_ACCESS_MESSAGE = (
    "이 기업에는 아직 광고 계정이 연결되지 않아 순위 자동 수집을 쓸 수 없습니다. "
    "키워드 보고서를 올리면 순위 추이와 하락 감지는 그대로 사용할 수 있습니다."
)


def credential_owner_company_id() -> int:
    """서버에 설정된 네이버 키가 어느 기업의 것인가."""
    return settings.NAVER_CREDENTIAL_COMPANY_ID


def has_naver_access(company_id: int | None) -> bool:
    """이 기업이 **서버의 광고 계정을 쓸 자격이 있는가** — 소유권만 본다.

    "키가 설정돼 있는가"는 일부러 섞지 않는다. 섞으면 호출부가 두 가지 다른 상황을
    구분할 수 없어, 키 부재를 "남의 계정"으로 안내하거나(문구 오류) 외부 API 와
    무관한 경로까지 키에 묶이게 된다(업로드 알림이 그렇게 끊겼다). 각 호출부는
    settings.is_naver_searchad_configured(또는 service.is_configured)로 설정 유무를
    **먼저** 보고, 그다음 이 함수로 소유권을 본다.

    company_id=None 은 시스템 경로(크론)에서 "기업을 특정하지 않음"을 뜻하는데,
    그대로 통과시키면 전 기업 감시를 소유 기업 키로 돌리게 된다. 호출부가
    naver_scope_company_id() 로 범위를 좁히는 것을 전제로 여기서는 거절한다.
    """
    return company_id is not None and company_id == credential_owner_company_id()


def owns_global_alert_recipients(company_id: int | None) -> bool:
    """이 기업이 전역 알림 수신자(RANK_ALERT_RECIPIENTS)의 주인인가.

    네이버 키와는 **별개 사실**이다. 알림은 업로드만으로도 나가므로 외부 API 설정과
    무관하고, 제약의 출처는 "수신자가 아직 전역 1벌"이라는 것뿐이다. 과도기에는
    자격증명 소유 기업과 같은 기업이지만, 기업별 수신자 저장소가 생기면 이 함수만
    바뀌고 네이버 쪽은 손대지 않는다.
    """
    return company_id is not None and company_id == credential_owner_company_id()


def naver_scope_company_id() -> int | None:
    """시스템 경로(크론)가 외부 API 를 돌릴 기업 범위.

    키가 전역 1벌인 동안에는 소유 기업 하나뿐이다. 설정이 비어 있으면 None 을
    돌려 호출부가 아예 돌지 않게 한다.
    """
    if not settings.is_naver_searchad_configured:
        return None
    return credential_owner_company_id()
