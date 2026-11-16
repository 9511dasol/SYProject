import { formatPercentChange } from '@/lib/format';
import type { MediaSummary } from '@/types/marketing';

/**
 * 기간 비교(MoM·YoY) 증감 계산.
 *
 * - 양(量) 지표(노출·클릭·광고비 …)는 증감률(%)로,
 *   비율 지표(CTR·ROAS)는 %가 중첩되면 헷갈려서 %p 차이로 보여준다.
 * - 색은 "좋아졌는가" 기준이다 — CPC 는 내려가야 좋고, 광고비는 늘어난 것이
 *   좋다고도 나쁘다고도 말할 수 없어 중립색으로 둔다.
 */

export type Direction = 'up-good' | 'down-good' | 'neutral';
export type DeltaTone = 'success' | 'danger' | 'neutral';

export interface Delta {
  text: string; // "+12.3%" 또는 "+1.2%p"
  tone: DeltaTone;
}

function toneOf(diff: number, dir: Direction): DeltaTone {
  if (diff === 0 || dir === 'neutral') return 'neutral';
  const improved = dir === 'up-good' ? diff > 0 : diff < 0;
  return improved ? 'success' : 'danger';
}

/**
 * 한 지표의 기간 대비 증감. 비교 기간 값이 없어 계산이 불가능하면 null —
 * 호출부에서 '–' 로 표시한다.
 */
export function metricDelta(
  curr: number,
  prev: number | undefined,
  dir: Direction,
  isRate: boolean,
): Delta | null {
  if (prev === undefined) return null;

  if (isRate) {
    const diff = curr - prev;
    const pp = diff * 100;
    return {
      text: `${pp > 0 ? '+' : ''}${pp.toFixed(1)}%p`,
      tone: toneOf(diff, dir),
    };
  }

  const text = formatPercentChange(curr, prev); // prev 0 이면 null (증감률 계산 불가)
  if (text === null) return null;
  return { text, tone: toneOf(curr - prev, dir) };
}

/** 비교 표와 KPI 카드가 공유하는 지표 정의 — 순서가 곧 표의 행 순서다 */
export interface MetricMeta {
  key: keyof Pick<
    MediaSummary,
    | 'impressions'
    | 'clicks'
    | 'ctr'
    | 'cpc'
    | 'cost'
    | 'total_conv'
    | 'signup'
    | 'purchase'
    | 'revenue'
    | 'roas'
  >;
  label: string;
  dir: Direction;
  isRate: boolean;
  format: 'num' | 'pct' | 'won' | 'dec';
}

export const COMPARE_METRICS: MetricMeta[] = [
  { key: 'impressions', label: '노출', dir: 'up-good', isRate: false, format: 'num' },
  { key: 'clicks', label: '클릭', dir: 'up-good', isRate: false, format: 'num' },
  { key: 'ctr', label: 'CTR', dir: 'up-good', isRate: true, format: 'pct' },
  { key: 'cpc', label: 'CPC', dir: 'down-good', isRate: false, format: 'won' },
  { key: 'cost', label: '광고비', dir: 'neutral', isRate: false, format: 'won' },
  { key: 'total_conv', label: '전환수', dir: 'up-good', isRate: false, format: 'dec' },
  { key: 'signup', label: '회원가입', dir: 'up-good', isRate: false, format: 'dec' },
  { key: 'purchase', label: '구매완료', dir: 'up-good', isRate: false, format: 'dec' },
  { key: 'revenue', label: '구매매출', dir: 'up-good', isRate: false, format: 'won' },
  { key: 'roas', label: 'ROAS', dir: 'up-good', isRate: true, format: 'pct' },
];
