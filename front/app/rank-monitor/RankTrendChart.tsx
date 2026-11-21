'use client';

import { useMemo, useState } from 'react';
import ChartCard from '@/components/charts/ChartCard';
import { useChartTheme } from '@/hooks/useChartTheme';
import { formatCount } from '@/lib/format';
import type { RankSnapshot } from '@/types/rankMonitor';

/**
 * 순위 추이 — 선 하나와 목표선.
 *
 * TrendChart 와 같은 좌표계(viewBox 0 0 100 100 + preserveAspectRatio="none",
 * 선 굵기는 non-scaling-stroke 로 고정, 글자·점·툴팁은 SVG 밖 HTML)를 따르되
 * 순위 차트만의 두 가지가 다르다.
 *
 * 1. Y축이 뒤집힌다 — 1위가 맨 위다. 값이 "클수록 좋은" 지표 차트를 그대로 쓰면
 *    순위 상승이 아래로 떨어지는 그림이 된다.
 * 2. 노출 없는 날(avg_rank=null)은 0으로 그리지 않고 선을 끊는다 — 0위는 1위보다
 *    좋은 순위처럼 읽히기 때문이다. 끊긴 구간이 곧 "노출이 사라졌던 기간"이다.
 */

interface RankTrendChartProps {
  points: RankSnapshot[];
  targetRank: number;
}

const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1];

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

function rankLabel(value: number): string {
  return Number.isInteger(value) ? `${value}위` : `${value.toFixed(1)}위`;
}

export default function RankTrendChart({ points, targetRank }: RankTrendChartProps) {
  const chart = useChartTheme();
  const [hover, setHover] = useState<number | null>(null);

  const lineColor = chart.seriesColor(0);
  const targetColor = chart.seriesColor(2);
  const n = points.length;

  const geometry = useMemo(() => {
    const ranks = points.map((p) => p.avg_rank);
    const observed = ranks.filter((r): r is number => r !== null);
    // 축 아래끝 — 관측 최대 순위와 목표선이 모두 들어가고, 선이 바닥에 붙지 않게 1 여유
    const yMax = Math.max(5, Math.ceil(Math.max(...observed, targetRank, 0)) + 1);
    const xOf = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
    // 1위가 맨 위(0), yMax 가 바닥(100)
    const yOf = (rank: number) => ((rank - 1) / (yMax - 1)) * 100;

    // 노출 없는 날에서 선을 끊는다 — null 을 만나면 다음 값부터 새 세그먼트.
    // 점이 하나뿐인 구간은 선으로 그릴 수 없다(`M`만 있는 path 는 아무것도 그리지
    // 않는다). 노출이 하루씩 끊기는 키워드는 모든 구간이 그런 모양이라 그래프가
    // 통째로 비어 보인다 — 그 점들만 따로 찍어 준다.
    const segments: string[] = [];
    const isolated: number[] = [];
    let current = '';
    let runStart = -1;
    let runLength = 0;

    const closeRun = () => {
      if (runLength === 1) isolated.push(runStart);
      else if (runLength > 1) segments.push(current);
      current = '';
      runLength = 0;
    };

    ranks.forEach((rank, i) => {
      if (rank === null) {
        closeRun();
        return;
      }
      if (runLength === 0) runStart = i;
      runLength += 1;
      current += `${current ? ' L' : 'M'}${xOf(i).toFixed(2)},${yOf(rank).toFixed(2)}`;
    });
    closeRun();

    return { ranks, yMax, xOf, yOf, segments, isolated };
  }, [points, targetRank, n]);

  // 눈금은 6개까지만 — 90일치를 다 적으면 글자가 겹친다
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
    setHover((h) => {
      // 아직 아무 날짜도 고르지 않았으면 첫(또는 마지막) 날짜부터 읽는다.
      // `(h ?? 0) + delta` 로 두면 → 를 처음 눌렀을 때 0 번을 건너뛰고 1 번이 된다.
      if (h === null) return delta > 0 ? 0 : n - 1;
      return Math.min(n - 1, Math.max(0, h + delta));
    });
  }

  const hovered = hover !== null && hover < n ? hover : null;
  const hoveredRank = hovered !== null ? geometry.ranks[hovered] : null;
  const targetY = geometry.yOf(targetRank);

  return (
    <ChartCard
      title="순위 추이"
      isEmpty={n === 0}
      emptyText="아직 적재된 순위 기록이 없습니다"
      toolbar={
        <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <span aria-hidden className="w-4 border-t-2 border-dashed" style={{ borderColor: targetColor }} />
          목표 {rankLabel(targetRank)}
        </span>
      }
    >
      <div className="flex gap-2">
        {/* Y축 눈금 — 위가 1위 */}
        <div className="relative w-10 h-40 sm:h-48 shrink-0" aria-hidden>
          {GRID_RATIOS.map((r) => (
            <span
              key={r}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-chart-label"
              style={{ top: `${r * 100}%` }}
            >
              {rankLabel(1 + (geometry.yMax - 1) * r)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="relative h-40 sm:h-48 cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring rounded"
            tabIndex={0}
            role="group"
            aria-label="순위 일별 추이. 좌우 방향키로 날짜별 순위를 읽을 수 있습니다"
            onPointerMove={(e) => moveHover(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={handleKeyDown}
            onBlur={() => setHover(null)}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
              /* 값은 호버 툴팁이 aria-live 로 읽어 준다 — 그림 자체는 보조기술에 감춘다 */
              aria-hidden
            >
              {GRID_RATIOS.map((r) => (
                <line
                  key={r}
                  x1="0"
                  x2="100"
                  y1={r * 100}
                  y2={r * 100}
                  className="stroke-chart-grid"
                  strokeWidth={1}
                  strokeDasharray={r === 1 ? undefined : chart.gridDash}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* 목표선 — 이 선 아래로 내려가면(순위 숫자가 커지면) 이탈이다 */}
              <line
                x1="0"
                x2="100"
                y1={targetY}
                y2={targetY}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                style={{ stroke: targetColor }}
              />

              {geometry.segments.map((d) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ stroke: lineColor }}
                />
              ))}
            </svg>

            {/* 읽어 주는 영역은 **항상** DOM 에 둔다. 값이 생길 때 영역째로 끼워 넣으면
                스크린리더가 변경을 알아차리지 못해 아무것도 읽지 않는다 — 이 차트에는
                값을 담은 표가 따로 없어서, 이게 유일한 접근 경로다. */}
            <div role="status" aria-live="polite" className="sr-only">
              {hovered !== null
                ? `${longDate(points[hovered].stat_date)} ${
                    hoveredRank !== null
                      ? rankLabel(Math.round(hoveredRank * 10) / 10)
                      : '노출 없음'
                  }, 노출 ${points[hovered].impressions}회, 클릭 ${points[hovered].clicks}회`
                : ''}
            </div>

            {/* 선으로 이어지지 않는 외톨이 점 — SVG 밖에서 그린다(안에 두면 찌그러진다) */}
            {geometry.isolated.map((i) => (
              <div
                key={`dot-${points[i].stat_date}`}
                aria-hidden
                className="absolute w-2 h-2 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${geometry.xOf(i)}%`,
                  top: `${geometry.yOf(geometry.ranks[i] as number)}%`,
                  background: lineColor,
                }}
              />
            ))}

            {/* 호버 표시 — 원과 글자는 찌그러지면 안 되므로 SVG 밖에서 그린다 */}
            {hovered !== null && (
              <>
                <div
                  aria-hidden
                  className="absolute top-0 bottom-0 w-px bg-border pointer-events-none"
                  style={{ left: `${geometry.xOf(hovered)}%` }}
                />
                {hoveredRank !== null && (
                  <div
                    aria-hidden
                    className="absolute w-2.5 h-2.5 rounded-full border-2 border-surface pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${geometry.xOf(hovered)}%`,
                      top: `${geometry.yOf(hoveredRank)}%`,
                      background: lineColor,
                    }}
                  />
                )}
                <div
                  aria-hidden
                  className="absolute z-[var(--z-popover)] pointer-events-none whitespace-nowrap
                    rounded-lg border border-border bg-surface shadow-overlay px-2.5 py-1.5"
                  style={{
                    left: `${geometry.xOf(hovered)}%`,
                    top: `${hoveredRank !== null ? geometry.yOf(hoveredRank) : 50}%`,
                    // 양 끝에서는 툴팁이 그래프 밖으로 나가므로 기준점을 옮긴다
                    transform: `translate(${
                      geometry.xOf(hovered) < 15 ? '0'
                        : geometry.xOf(hovered) > 85 ? '-100%'
                        : '-50%'
                    }, calc(-100% - 10px))`,
                  }}
                >
                  <p className="text-[10px] text-fg-subtle">{longDate(points[hovered].stat_date)}</p>
                  <p className="text-xs font-semibold text-fg tabular-nums">
                    {hoveredRank !== null ? rankLabel(Math.round(hoveredRank * 10) / 10) : '노출 없음'}
                  </p>
                  <p className="text-[10px] text-fg-subtle tabular-nums">
                    노출 {formatCount(points[hovered].impressions)} · 클릭{' '}
                    {formatCount(points[hovered].clicks)}
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
                {shortDate(points[i].stat_date)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
