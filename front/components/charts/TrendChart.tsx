'use client';

import { useId, useMemo, useState } from 'react';
import ChartCard from '@/components/charts/ChartCard';
import MetricToggle from '@/components/charts/MetricToggle';
import { useChartTheme } from '@/hooks/useChartTheme';
import { TREND_METRICS, type TrendMetric, type TrendPoint } from '@/lib/chartData';

/**
 * 일별 추이 — 면적 + 선.
 *
 * 왜 차트 라이브러리를 쓰지 않았나
 * ──────────────────────────────
 * 필요한 게 선 하나와 눈금뿐이라 recharts(gzip 약 100KB)를 얹을 이유가 없었다.
 * 예전 useChartTheme 이 recharts 를 전제로 쓰여 있었는데 그 패키지는 설치된 적이
 * 없어서, 훅도 차트도 아무 데서도 쓰이지 않는 채로 남아 있었다.
 *
 * 좌표계
 * ─────
 * SVG 는 viewBox="0 0 100 100" + preserveAspectRatio="none" 으로 둔다. 좌표를
 * 그대로 퍼센트로 쓸 수 있어 계산이 단순해지고, 컨테이너 폭이 얼마든 알아서 늘어난다.
 * 대신 축이 서로 다른 비율로 늘어나므로 SVG 안에는 **찌그러져도 되는 것만** 둔다 —
 * 선과 면적뿐이고, `vector-effect="non-scaling-stroke"` 로 선 굵기는 고정한다.
 * 글자 · 점 · 툴팁은 찌그러지면 안 되니 SVG 밖에서 HTML 로 그리고 % 로 얹는다.
 * (이 방식이라 ResizeObserver 로 폭을 잴 필요가 없다 — 첫 렌더부터 정확하다.)
 */

interface TrendChartProps {
  points: TrendPoint[];
  title: string;
  defaultMetric?: TrendMetric;
}

/** 축 최댓값을 1 · 2 · 2.5 · 5 · 10 × 10ⁿ 중 하나로 올림 — 눈금이 읽을 만한 수가 된다 */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(value));
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * base;
}

/** "2026-08-01" → "8/1" (축 눈금은 자리가 좁다) */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** "2026-08-01" → "8월 1일" (툴팁) */
function longDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1];

export default function TrendChart({ points, title, defaultMetric = 'cost' }: TrendChartProps) {
  const chart = useChartTheme();
  // 한 화면에 추이 차트가 둘 이상 있어도 그라디언트가 섞이지 않게 id 를 분리한다
  const gradientId = useId();
  const [metric, setMetric] = useState<TrendMetric>(defaultMetric);
  const [hover, setHover] = useState<number | null>(null);

  const meta = TREND_METRICS.find((m) => m.key === metric) ?? TREND_METRICS[0];
  const color = chart.seriesColor(meta.colorIndex);
  const n = points.length;

  const geometry = useMemo(() => {
    const values = points.map((p) => p[metric]);
    const yMax = niceCeil(Math.max(0, ...values));
    // 점이 하나면 나눌 구간이 없다 — 가운데에 세운다
    const xOf = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
    const yOf = (v: number) => 100 - (v / yMax) * 100;

    const line = values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`)
      .join(' ');
    // 면적은 선을 따라가다 바닥(y=100)을 훑고 돌아온다
    const area = n > 0
      ? `${line} L${xOf(n - 1).toFixed(2)},100 L${xOf(0).toFixed(2)},100 Z`
      : '';

    return { values, yMax, xOf, yOf, line, area };
  }, [points, metric, n]);

  // 눈금은 6개까지만 — 한 달치(31일)를 다 적으면 글자가 겹친다
  const tickStep = Math.max(1, Math.ceil(n / 6));
  const tickIndexes = points.map((_, i) => i).filter((i) => i % tickStep === 0);

  function moveHover(clientX: number, el: HTMLElement) {
    if (n === 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0 || n === 0) return;
    e.preventDefault();
    setHover((h) => Math.min(n - 1, Math.max(0, (h ?? 0) + delta)));
  }

  const hovered = hover !== null && hover < n ? hover : null;

  return (
    <ChartCard
      title={title}
      isEmpty={n === 0}
      emptyText="이 기간에 일별 데이터가 없습니다"
      toolbar={
        <MetricToggle
          options={TREND_METRICS}
          value={metric}
          onChange={setMetric}
          label={`${title} 지표 선택`}
        />
      }
    >
      <div className="flex gap-2">
        {/* Y축 눈금 — 그래프와 같은 높이를 잡고 각 격자선에 맞춰 얹는다 */}
        <div className="relative w-14 h-40 sm:h-48 shrink-0" aria-hidden>
          {GRID_RATIOS.map((r) => (
            <span
              key={r}
              // 맨 위·아래 눈금은 반만 밀어야 그래프 영역 밖으로 새지 않는다
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-chart-label"
              style={{ top: `${(1 - r) * 100}%` }}
            >
              {meta.axis(geometry.yMax * r)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="relative h-40 sm:h-48 cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring rounded"
            tabIndex={0}
            role="group"
            aria-label={`${title} — ${meta.label} 일별 추이. 좌우 방향키로 날짜별 값을 읽을 수 있습니다`}
            onPointerMove={(e) => moveHover(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={handleKeyDown}
            onBlur={() => setHover(null)}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
              /* 값은 바로 아래 표에도 다 있고, 호버 툴팁이 aria-live 로 읽어 준다 —
                 그림 자체는 보조기술에 중복이라 감춘다 */
              aria-hidden
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  {/* stop-color 는 CSS 속성으로 넘긴다 — var() 가 확실히 해석된다 */}
                  <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
                </linearGradient>
              </defs>

              {GRID_RATIOS.map((r) => (
                <line
                  key={r}
                  x1="0"
                  x2="100"
                  y1={(1 - r) * 100}
                  y2={(1 - r) * 100}
                  className="stroke-chart-grid"
                  strokeWidth={1}
                  strokeDasharray={r === 0 ? undefined : chart.gridDash}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {geometry.area && <path d={geometry.area} fill={`url(#${gradientId})`} />}
              {n > 1 && (
                <path
                  d={geometry.line}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ stroke: color }}
                />
              )}
            </svg>

            {/* 호버 표시 — 원과 글자는 찌그러지면 안 되므로 SVG 밖에서 그린다 */}
            {hovered !== null && (
              <>
                <div
                  aria-hidden
                  className="absolute top-0 bottom-0 w-px bg-border pointer-events-none"
                  style={{ left: `${geometry.xOf(hovered)}%` }}
                />
                <div
                  aria-hidden
                  className="absolute w-2.5 h-2.5 rounded-full border-2 border-surface pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${geometry.xOf(hovered)}%`,
                    top: `${geometry.yOf(geometry.values[hovered])}%`,
                    background: color,
                  }}
                />
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute z-[var(--z-popover)] pointer-events-none whitespace-nowrap
                    rounded-lg border border-border bg-surface shadow-overlay px-2.5 py-1.5"
                  style={{
                    left: `${geometry.xOf(hovered)}%`,
                    top: `${geometry.yOf(geometry.values[hovered])}%`,
                    // 양 끝에서는 툴팁이 그래프 밖으로 나가므로 기준점을 옮긴다
                    transform: `translate(${
                      geometry.xOf(hovered) < 15 ? '0'
                        : geometry.xOf(hovered) > 85 ? '-100%'
                        : '-50%'
                    }, calc(-100% - 10px))`,
                  }}
                >
                  <p className="text-[10px] text-fg-subtle">{longDate(points[hovered].date)}</p>
                  <p className="text-xs font-semibold text-fg tabular-nums">
                    {meta.exact(geometry.values[hovered])}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* X축 눈금 */}
          <div className="relative h-4 mt-1" aria-hidden>
            {tickIndexes.map((i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 text-[10px] tabular-nums text-chart-label"
                style={{ left: `${geometry.xOf(i)}%` }}
              >
                {shortDate(points[i].date)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
