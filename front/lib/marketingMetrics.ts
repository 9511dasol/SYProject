import type { MediaDailyRow, RowFormData } from '@/types/marketing';

/**
 * 마케팅 파생지표 계산 — CTR · CPC · 전환율 · 전환단가 · ROAS.
 *
 * 서버가 저장한 값과 같은 공식을 써야 편집 중인 행과 저장된 행이 같은 숫자를 보인다.
 * 화면 컴포넌트 안에 있던 것을 꺼내 온 것이다.
 */

/** 0으로 나누기를 막는다. 분모가 0이면 지표 자체가 정의되지 않으므로 0으로 둔다. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** 편집 폼 입력값을 표에 그릴 수 있는 행으로 바꾼다 (파생지표를 채워 넣는다) */
export function formToDisplayRow(form: RowFormData): MediaDailyRow {
  const { impressions, clicks, cost, conversions, conversion_revenue: revenue } = form;

  return {
    date: form.report_date,
    impressions,
    clicks,
    cost,
    ctr: ratio(clicks, impressions),
    cpc: ratio(cost, clicks),
    total_conv: conversions,
    conv_rate: ratio(conversions, clicks),
    conv_cost: ratio(cost, conversions),
    signup: form.signup,
    purchase: form.purchase,
    revenue,
    apply: form.apply,
    roas: ratio(revenue, cost),
  };
}

/** 표에 그릴 행을 편집 폼 초기값으로 되돌린다 (formToDisplayRow 의 역방향) */
export function displayRowToForm(row: MediaDailyRow, campaignType: string): RowFormData {
  return {
    report_date: row.date,
    campaign_type: campaignType,
    impressions: Math.round(row.impressions),
    clicks: Math.round(row.clicks),
    cost: row.cost,
    conversions: Math.round(row.total_conv),
    conversion_revenue: row.revenue,
    signup: row.signup,
    purchase: row.purchase,
    apply: row.apply,
  };
}

/** 빈 행 — '행 추가' 의 초기값 */
export function emptyRowForm(campaignType: string, date: string): RowFormData {
  return {
    report_date: date,
    campaign_type: campaignType,
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversion_revenue: 0,
    signup: 0,
    purchase: 0,
    apply: 0,
  };
}

/**
 * 그 날짜에 볼 만한 실적이 하나라도 있는지 — 빈 날짜를 표에서 숨기는 기준.
 *
 * 전환 지표까지 보는 이유: 전환 CSV만 올린 날은 노출·클릭·비용이 0이라, 노출만
 * 보던 예전 조건으로는 한 달치가 통째로 사라져 '데이터 없음' 이 떴다.
 */
export function hasAnyMetric(r: MediaDailyRow): boolean {
  return r.impressions > 0 || r.clicks > 0 || r.cost > 0 || r.total_conv > 0 || r.revenue > 0;
}
