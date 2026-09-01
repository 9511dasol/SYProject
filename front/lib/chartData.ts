import { formatCompact, formatNumber } from '@/lib/format';
import { MEDIA_ORDER } from '@/lib/marketingMeta';
import type { MediaDailyRow, MediaSummary } from '@/types/marketing';

/**
 * 리포트 데이터 → 차트가 먹는 모양.
 *
 * 계산을 컴포넌트 밖에 두는 이유는 표와 같다 — 요약 탭(전 매체 합계)과 매체 탭
 * (한 매체)이 같은 차트를 쓰는데, 둘의 차이는 "무엇을 합치느냐" 뿐이다.
 */

// ── 추이 차트 ─────────────────────────────────────────────────────────────────

/** 일별 추이에서 고를 수 있는 지표 */
export type TrendMetric = 'cost' | 'impressions' | 'clicks' | 'total_conv';

export interface TrendPoint extends Record<TrendMetric, number> {
  date: string;   // "YYYY-MM-DD"
}

interface TrendMetricMeta {
  key: TrendMetric;
  label: string;
  /** 축 눈금용 — 자리가 좁아 축약한다 ("1.2억") */
  axis: (v: number) => string;
  /** 툴팁용 — 정확한 값 */
  exact: (v: number) => string;
  /** 시리즈 색 인덱스 (useChartTheme.seriesColor) */
  colorIndex: number;
}

/**
 * 지표마다 색을 고정한다. 지표를 바꿀 때마다 선 색이 같이 바뀌어야
 * "지금 무엇을 보고 있는지"가 토글 버튼을 다시 보지 않아도 읽힌다.
 */
export const TREND_METRICS: readonly TrendMetricMeta[] = [
  { key: 'cost',        label: '광고비', axis: (v) => `${formatCompact(v)}원`, exact: (v) => `${formatNumber(v)}원`, colorIndex: 0 },
  { key: 'impressions', label: '노출',   axis: formatCompact,                  exact: formatNumber,                  colorIndex: 5 },
  { key: 'clicks',      label: '클릭',   axis: formatCompact,                  exact: formatNumber,                  colorIndex: 1 },
  { key: 'total_conv',  label: '전환',   axis: formatCompact,                  exact: formatNumber,                  colorIndex: 4 },
];

const EMPTY_POINT = { cost: 0, impressions: 0, clicks: 0, total_conv: 0 };

/** 일별 행 → 추이 포인트. 날짜순으로 정렬하고, 실적이 하나도 없는 날은 뺀다 */
export function toTrendPoints(rows: readonly MediaDailyRow[]): TrendPoint[] {
  return rows
    .map((r) => ({
      date: r.date,
      cost: r.cost,
      impressions: r.impressions,
      clicks: r.clicks,
      total_conv: r.total_conv,
    }))
    .filter((p) => p.cost > 0 || p.impressions > 0 || p.clicks > 0 || p.total_conv > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 전 매체를 날짜로 합친다 — 요약 탭의 추이.
 *
 * 매체마다 데이터가 있는 날짜가 다르다. 한 매체에만 있는 날짜를 빠뜨리면 그날
 * 합계가 통째로 사라지므로, 등장한 모든 날짜를 모아 놓고 더한다.
 */
export function mergeDailyTotals(daily: Record<string, MediaDailyRow[]>): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();

  for (const rows of Object.values(daily)) {
    for (const r of rows) {
      const acc = byDate.get(r.date) ?? { date: r.date, ...EMPTY_POINT };
      acc.cost += r.cost;
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.total_conv += r.total_conv;
      byDate.set(r.date, acc);
    }
  }

  return [...byDate.values()]
    .filter((p) => p.cost > 0 || p.impressions > 0 || p.clicks > 0 || p.total_conv > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── 매체별 비중 ───────────────────────────────────────────────────────────────

/** 비중 막대에서 고를 수 있는 지표 */
export type ShareMetric = 'cost' | 'clicks' | 'total_conv';

export interface MediaShare {
  label: string;
  value: number;
  /** 0~1. 전체가 0이면 0 */
  share: number;
  /** 시리즈 색 인덱스 — MEDIA_ORDER 기준이라 화면·기간이 바뀌어도 매체 색이 그대로다 */
  colorIndex: number;
}

export const SHARE_METRICS: readonly { key: ShareMetric; label: string; format: (v: number) => string }[] = [
  { key: 'cost',       label: '광고비', format: (v) => `${formatNumber(v)}원` },
  { key: 'clicks',     label: '클릭',   format: formatNumber },
  { key: 'total_conv', label: '전환',   format: formatNumber },
];

/**
 * 매체별 현황 → 비중 막대. 값이 큰 순서로 정렬하되 색은 MEDIA_ORDER 를 따른다 —
 * 순위가 바뀐다고 매체 색까지 바뀌면 기간을 넘겨 볼 때 같은 매체를 눈으로 못 쫓는다.
 */
export function toMediaShares(rows: readonly MediaSummary[], metric: ShareMetric): MediaShare[] {
  const total = rows.reduce((sum, r) => sum + r[metric], 0);

  return rows
    .map((r) => {
      const orderIndex = MEDIA_ORDER.indexOf(r.label);
      return {
        label: r.label,
        value: r[metric],
        share: total > 0 ? r[metric] / total : 0,
        // MEDIA_ORDER 에 없는 매체(신규 등)는 이름으로 색을 정해 최소한 고정은 되게 한다
        colorIndex: orderIndex >= 0 ? orderIndex : MEDIA_ORDER.length + r.label.length,
      };
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}
