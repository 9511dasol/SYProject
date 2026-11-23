"""키워드 비교 응답 계약.

예전에는 라우터가 `-> dict` 로 열려 있어 OpenAPI 에 응답 모양이 실리지 않았고,
프런트는 같은 구조를 손으로 적어 두고 있었다. 백엔드가 키 이름 하나를 바꿔도
화면은 모른 채 지나가다가 런타임에 빈 값으로 드러나는 구조였다.

여기서 모양을 고정하면 프런트 타입이 이 정의에서 생성되므로, 어긋나는 순간
타입 검사에서 걸린다.
"""

from typing import Literal

from pydantic import BaseModel, Field

# 전기 대비 변화 — 서비스의 _row_status 와 같은 값이어야 한다.
RowStatus = Literal["new", "gone", "up", "down", "same"]


class CompareRow(BaseModel):
    campaign_type: str
    device: str
    keyword: str
    conv_type: str
    curr_conv: float
    curr_amount: float
    prev_conv: float
    prev_amount: float
    diff_conv: float
    diff_amount: float
    status: RowStatus


class SheetSummary(BaseModel):
    total_curr_conv: float
    total_curr_amount: float
    total_prev_conv: float
    total_prev_amount: float
    diff_conv: float
    diff_amount: float
    count_up: int
    count_down: int
    count_new: int
    count_gone: int
    count_same: int


class CompareSheet(BaseModel):
    name: str
    period: str
    rows: list[CompareRow]
    summary: SheetSummary
    # 화면 필터용 선택지 — 행에 실제로 등장한 값만 담는다.
    campaign_types: list[str]
    devices: list[str]
    conv_types: list[str]


class SkippedSheet(BaseModel):
    name: str
    reason: str = Field(description="건너뛴 이유 — 화면이 그대로 보여 준다")


class CompareResult(BaseModel):
    sheets: list[CompareSheet]
    # 해석하지 못한 시트 — 조용히 빼면 사용자는 누락을 알 수 없다.
    skipped_sheets: list[SkippedSheet]
