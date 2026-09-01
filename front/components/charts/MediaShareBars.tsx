'use client';

import { useMemo, useState } from 'react';
import ChartCard from '@/components/charts/ChartCard';
import MetricToggle from '@/components/charts/MetricToggle';
import { useChartTheme } from '@/hooks/useChartTheme';
import { SHARE_METRICS, toMediaShares, type ShareMetric } from '@/lib/chartData';
import { formatPercent } from '@/lib/format';
import { mediaLabel } from '@/lib/marketingMeta';
import type { MediaSummary } from '@/types/marketing';

/**
 * 매체별 비중 — 가로 막대.
 *
 * SVG 가 아니라 그냥 div 다. 가로 막대는 길이 하나만 있으면 되는데, SVG 로 그리면
 * 매체 이름 줄바꿈과 폭 계산을 직접 해야 한다. 표처럼 마크업으로 두면 좁은 화면에서
 * 알아서 접히고, 값이 텍스트라 그대로 읽히고 복사도 된다.
 */
export default function MediaShareBars({ rows }: { rows: MediaSummary[] }) {
  const chart = useChartTheme();
  const [metric, setMetric] = useState<ShareMetric>('cost');

  const meta = SHARE_METRICS.find((m) => m.key === metric) ?? SHARE_METRICS[0];
  const shares = useMemo(() => toMediaShares(rows, metric), [rows, metric]);

  return (
    <ChartCard
      title="매체별 비중"
      isEmpty={shares.length === 0}
      emptyText={`${meta.label} 값이 있는 매체가 없습니다`}
      toolbar={
        <MetricToggle
          options={SHARE_METRICS}
          value={metric}
          onChange={setMetric}
          label="매체별 비중 지표 선택"
        />
      }
    >
      <ul className="space-y-2.5">
        {shares.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span className="w-20 sm:w-24 shrink-0 truncate text-xs font-medium text-fg-body">
              {mediaLabel(s.label)}
            </span>

            <div className="flex-1 min-w-0 h-2.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                /* 비중이 아주 작아도 막대가 보이게 최소 폭을 준다 — 0.2% 짜리 매체가
                   완전히 사라지면 "값이 없다"로 잘못 읽힌다 */
                style={{
                  width: `${Math.max(s.share * 100, 1.5)}%`,
                  background: chart.seriesColor(s.colorIndex),
                }}
              />
            </div>

            <span className="w-11 shrink-0 text-right text-xs font-semibold text-fg tabular-nums">
              {formatPercent(s.share, 1)}
            </span>
            <span className="hidden sm:block w-28 shrink-0 text-right text-xs text-fg-muted tabular-nums">
              {meta.format(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
