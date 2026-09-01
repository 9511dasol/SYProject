/**
 * 차트가 색을 얻는 입구 — 단 하나.
 *
 * 예전 구현은 라이트/다크 팔레트를 hex 로 통째로 들고 `next-themes` 의
 * resolvedTheme 을 보고 골라 줬다. 문제가 세 가지였다.
 *
 *   1. 같은 색이 globals.css 와 여기 두 군데에 있었고 이미 어긋나 있었다 —
 *      다크 툴팁 배경이 --surface 는 #0f172a 인데 훅에는 #1e293b 였다.
 *   2. resolvedTheme 은 서버 렌더 시 undefined 라 다크 모드에서도 첫 프레임이
 *      라이트 팔레트로 그려졌다(하이드레이션 후 번쩍임).
 *   3. 테마를 바꿀 때마다 차트가 통째로 리렌더됐다.
 *
 * 지금은 값이 전부 `var(--chart-*)` 문자열이다. 실제 색은 globals.css 의 토큰
 * 하나뿐이고 모드 전환은 CSS 가 처리한다 — 리렌더도, 번쩍임도 없다.
 *
 * 그래서 이 훅은 React 훅을 호출하지 않는다. 그래도 훅 자리에 두는 이유는,
 * 나중에 canvas 나 이미지 내보내기처럼 **계산된 실제 색**이 필요해지면
 * (getComputedStyle 이 필요하고 상태가 생긴다) 호출부를 그대로 두고 여기만
 * 바꾸면 되기 때문이다.
 *
 * 색이 고정된 축·격자는 이 훅을 거치지 않는다. `stroke-chart-grid` ·
 * `text-chart-label` 유틸리티로 칠하고, **JS 가 골라야 하는 색만** 여기서 받는다.
 *
 * @example
 * const chart = useChartTheme();
 * <path style={{ stroke: chart.seriesColor(mediaIndex) }} />
 */

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface ChartTheme {
  /**
   * 시리즈 색. 인덱스는 매체 순서(MEDIA_ORDER)를 그대로 쓴다 — 순위나 기간이
   * 바뀌어도 매체 색이 따라 바뀌지 않아야 여러 기간을 눈으로 비교할 수 있다.
   * 팔레트를 넘어가는 인덱스는 앞에서부터 다시 돈다.
   */
  seriesColor(index: number): string;
  /** 격자선 dash 패턴 — `strokeDasharray` 에 그대로 넣는다 */
  readonly gridDash: string;
}

// ── 팔레트 ────────────────────────────────────────────────────────────────────

/* globals.css 의 --chart-1 … --chart-7. 색값이 아니라 참조라서 여기에 복사본이
   생기지 않는다 — 팔레트를 늘리려면 globals.css 와 이 배열을 함께 늘린다. */
const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
] as const;

const THEME: ChartTheme = {
  seriesColor: (index) => SERIES[((index % SERIES.length) + SERIES.length) % SERIES.length],
  gridDash: '3 3',
};

// ── 훅 ───────────────────────────────────────────────────────────────────────

export function useChartTheme(): ChartTheme {
  return THEME;
}
