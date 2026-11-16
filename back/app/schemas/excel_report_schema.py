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
    headers: list[str] = Field(default_factory=list)
    rows: list[SaTotalRow] = Field(default_factory=list)


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

    headers: list[str] = Field(default_factory=list)
    total: list[Any] = Field(default_factory=list)
    daily: list[list[Any]] = Field(default_factory=list)


class ExcelReport(BaseModel):
    """한 기간(월)의 리포트 전체."""

    period: str
    period_info: PeriodInfo
    sa_total: SaTotal
    budget_table: list[BudgetRow] = Field(default_factory=list)
    comment: str = ""
    daily_total: list[DailyTotalRow] = Field(default_factory=list)
    media: dict[str, MediaSheetData] = Field(default_factory=dict)


class ExcelReportBundle(BaseModel):
    """/load-excel 응답 — 한 파일에 5월·6월이 있으면 달마다 리포트가 하나씩."""

    periods: list[str] = Field(default_factory=list)
    reports: list[ExcelReport] = Field(default_factory=list)
