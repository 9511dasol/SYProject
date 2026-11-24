'use client';

import BrowserFrame from './BrowserFrame';
import { useInView } from './useInView';

// ── 예시 데이터 — 상승 · 유지 · 경고 · 하락 네 가지 상태를 한 눈에 보여준다 ──
const KEYWORDS = [
  { keyword: '창업 컨설팅', rank: 3, delta: 2, trend: [55, 48, 60, 45, 38, 30, 22], warn: false },
  { keyword: '소상공인 지원', rank: 1, delta: 0, trend: [18, 15, 16, 14, 12, 12, 10], warn: false },
  { keyword: '정부지원금 신청', rank: 7, delta: -3, trend: [25, 28, 24, 35, 48, 62, 75], warn: true },
  { keyword: '온라인 마케팅 대행', rank: 4, delta: 1, trend: [60, 52, 58, 46, 42, 38, 34], warn: false },
] as const;

function Sparkline({ points, warn }: { points: readonly number[]; warn: boolean }) {
  const width = 64;
  const height = 20;
  const path = points
    .map((p, i) => `${((i / (points.length - 1)) * width).toFixed(1)},${((p / 100) * height).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-16 h-5 overflow-visible">
      <polyline
        points={path}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={warn ? 'stroke-amber-500' : 'stroke-[var(--chart-1)]'}
      />
    </svg>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="badge badge-success">
        <i className="bx bx-up-arrow-alt" />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="badge badge-danger">
        <i className="bx bx-down-arrow-alt" />
        {Math.abs(delta)}
      </span>
    );
  }
  return <span className="badge badge-neutral">—</span>;
}

/** 키워드 순위 모니터링 목업 — 순위 변동 리스트 + 목표 이탈 경고 */
export default function RankMonitorMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  return (
    <div ref={ref} aria-hidden>
      <BrowserFrame title="키워드 순위 모니터링">
        <div className="p-4 sm:p-5">
          <p className="text-[11px] text-fg-subtle">
            모니터링 키워드 4개 · 매일 09:00 자동 기록 · 목표 순위 이탈 시 표시
          </p>

          <ul className="mt-3 space-y-1.5">
            {KEYWORDS.map((row, i) => (
              <li
                key={row.keyword}
                style={{ transitionDelay: `${i * 110}ms` }}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5
                  transition-all duration-500 ease-out motion-reduce:transition-none
                  ${
                    inView
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-3 motion-reduce:opacity-100 motion-reduce:translate-y-0'
                  }
                  ${
                    row.warn
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-border-soft bg-surface-2/60'
                  }`}
              >
                <span className="flex-1 min-w-0 text-[13px] font-semibold text-fg truncate">
                  {row.keyword}
                </span>

                {row.warn && (
                  <span className="badge badge-amber shrink-0">
                    <i className="bx bx-error" />
                    목표 이탈
                  </span>
                )}

                <span className="text-[13px] font-bold text-fg tabular-nums shrink-0">
                  {row.rank}위
                </span>
                <DeltaBadge delta={row.delta} />
                <Sparkline points={row.trend} warn={row.warn} />
              </li>
            ))}
          </ul>
        </div>
      </BrowserFrame>
    </div>
  );
}
