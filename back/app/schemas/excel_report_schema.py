"""엑셀 리포트 읽기 결과의 응답 계약.

excel_reader_service 는 시트를 긁어 **순수 dict** 를 돌려주고, 프론트(types/marketing.ts)
는 그 모양을 손으로 베껴 둔 타입으로 받는다. 그래서 파서가 키 이름을 바꾸거나 칸을
빠뜨려도 백엔드에서는 아무도 걸러내지 않고, 화면에서 조용히 `undefined` 가 된다.
필드가 20개가 넘는 sa_total 행이 특히 어긋나기 쉽다.

여기에 계약을 두고 엔드포인트의 response_model 로 쓰면
- 파서 출력이 계약과 어긋나는 순간 서버에서 걸리고,
- OpenAPI 에 스키마가 실려 프론트 타입을 코드젠할 근거가 생긴다.

필드 이름은 프론트 types/marketing.ts 와 1:1 로 맞춰야 한다.
"""

from typing import Any

from pydantic import BaseModel, Field


class PeriodInfo(BaseModel):
    """summary 시트 3행 — 기간 진행 상황."""

    remaining_days: int
    elapsed_days: int
    total_days: int


class SaTotalRow(BaseModel):
    """전년/전월/당월/YOY/MOM/전주/금주/WoW 비교 행 (SA_TOTAL_COLS 와 같은 순서)."""

    label: str
    date: str = ""
    impressions: float = 0
    clicks: float = 0
    ctr: float = 0
    cpc: float = 0
    cost_vat: float = 0
    cost_markup: float = 0
    total_conv: float = 0
    conv_rate: float = 0
    conv_cost: float = 0
    total_conv_ex: float = 0
    conv_rate_ex: float = 0
    conv_cost_ex: float = 0
    signup: float = 0
    signup_rate: float = 0
    purchase: float = 0
    purchase_rate: float = 0
    revenue: float = 0
    roas: float = 0
    revenue_per_purchase: float = 0


class SaTotal(BaseModel):
    # 응답 전용 필드에는 기본값을 두지 않는다 — 파서가 항상 채워 보내는데 기본값이
    # 있으면 OpenAPI 가 "없을 수도 있음"으로 내보내, 화면이 쓰지 않아도 될 방어
    # 코드(`?.`, `?? []`)를 곳곳에 쓰게 된다. 비어 있을 때도 빈 목록은 온다.
    headers: list[str]
    rows: list[SaTotalRow]


class BudgetRow(BaseModel):
    """summary 시트 ■ 매체별 예산 표의 한 줄."""

    category: str
    budget: float = 0
    spent: float = 0
    burn_rate: float = 0
    impressions: float = 0
    clicks: float = 0
    cost_vat: float = 0
    total_conv: float = 0
    conv_rate: float = 0
    conv_cost: float = 0


class DailyTotalRow(BaseModel):
    """summary 시트 하단 일별 합계 한 줄."""

    date: str
    impressions: float = 0
    clicks: float = 0
    ctr: float = 0
    cpc: float = 0
    cost: float = 0
    total_conv: float = 0
    conv_rate: float = 0
    conv_cost: float = 0


class MediaSheetData(BaseModel):
    """매체 시트 — 헤더와 값 행들을 화면이 그대로 표로 그린다.

    셀 값 타입은 고정하지 않는다(Any). 이 계약의 목적은 키가 빠지거나 이름이 바뀌는
    구조적 드리프트를 잡는 것이지 셀 타입을 단속하는 게 아니고, openpyxl 은 수식 칸에서
    bool·Decimal 같은 값도 돌려주기 때문이다 — 타입을 좁히면 멀쩡한 파일이 500 이 된다.
    """

    headers: list[str]
    total: list[Any]
    daily: list[list[Any]]


class ExcelReport(BaseModel):
    """한 기간(월)의 리포트 전체."""

    period: str
    period_info: PeriodInfo
    sa_total: SaTotal
    budget_table: list[BudgetRow]
    comment: str
    daily_total: list[DailyTotalRow]
    media: dict[str, MediaSheetData]


class ExcelReportBundle(BaseModel):
    """/load-excel 응답 — 한 파일에 5월·6월이 있으면 달마다 리포트가 하나씩."""

    periods: list[str]
    reports: list[ExcelReport]


class ExcelPeriodSummary(BaseModel):
    """업로드 모달의 기간 선택 화면에 필요한 최소 정보."""

    period: str
    days: int = Field(description="실적이 들어 있는 일수 — 목록의 'N일' 배지")
    comment: str


class ExcelPeriodListResponse(BaseModel):
    """/excel-periods 응답.

    예전에는 `-> dict` 로 열려 있어 OpenAPI 에 모양이 실리지 않았고, 프런트가 같은
    구조를 손으로 적어 두고 있었다 — 키 이름이 갈려도 아무도 알아채지 못하는 구조다.
    """

    periods: list[ExcelPeriodSummary]
