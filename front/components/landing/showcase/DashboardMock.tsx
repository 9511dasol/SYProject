'use client';

import BrowserFrame from './BrowserFrame';
import { useCountUp } from './useCountUp';
import { useInView } from './useInView';

// ── 예시 데이터 — 전부 허구이며 '그럴듯한 모양'만을 위한 값 ─────────────────
const MONTHS = [
  { label: '6월', value: 46 },
  { label: '7월', value: 58 },
  { label: '8월', value: 52 },
  { label: '9월', value: 64 },
  { label: '10월', value: 73 },
  { label: '11월', value: 88 },
] as const;

const MEDIA_SHARE = [
  { label: '네이버', percent: 52, color: 'var(--chart-1)' },
  { label: '구글', percent: 31, color: 'var(--chart-2)' },
  { label: '카카오', percent: 17, color: 'var(--chart-3)' },
] as const;

/** 히어로 샷 — SA 광고 대시보드를 미니 화면으로 압축한 목업 */
export default function DashboardMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  const impressions = useCountUp(1_243_820, inView);
  const clicks = useCountUp(38_214, inView);
  const conversions = useCountUp(1_847, inView);
  const roas = useCountUp(412, inView);

  const kpis = [
    { label: '노출수', value: impressions.toLocaleString(), delta: '+12.4%' },
    { label: '클릭수', value: clicks.toLocaleString(), delta: '+8.1%' },
    { label: '전환수', value: conversions.toLocaleString(), delta: '+18.2%' },
    { label: 'ROAS', value: `${roas}%`, delta: '+31%p' },
  ];

  // 도넛 — stroke-dasharray 로 비중만큼 호를 그린다 (r=15.915 → 둘레 100).
  // 12시(offset 25)에서 시작해 앞선 조각들의 합만큼 밀어 시계방향으로 이어 붙인다.
  const donutSegments = MEDIA_SHARE.map((media, i) => ({
    ...media,
    offset: 25 - MEDIA_SHARE.slice(0, i).reduce((sum, m) => sum + m.percent, 0),
  }));

  return (
    <div ref={ref} aria-hidden>
      <BrowserFrame title="SA 광고 대시보드 — 2026년 11월">
        <div className="p-4 sm:p-5 space-y-4">
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-border-soft bg-surface-2/60 p-3">
                <p className="text-[11px] font-medium text-fg-subtle">{kpi.label}</p>
                <p className="mt-1 text-base sm:text-lg font-bold text-fg tabular-nums tracking-tight">
                  {kpi.value}
                </p>
                <span className="badge badge-success mt-1.5">
                  <i className="bx bx-up-arrow-alt" />
                  {kpi.delta}
                </span>
              </div>
            ))}
          </div>

          {/* 차트 영역 */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* 월별 막대 차트 */}
            <div className="flex-1 rounded-xl border border-border-soft bg-surface-2/60 p-3">
              <p className="text-[11px] font-medium text-fg-subtle">월별 전환수</p>
              <div className="mt-2 h-24 flex items-end gap-2">
                {MONTHS.map((month, i) => (
                  <div key={month.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full h-20 flex items-end">
                      <div
                        className={`w-full rounded-t-md transition-[height] duration-700 ease-out
                          motion-reduce:transition-none
                          ${i === MONTHS.length - 1 ? 'bg-primary' : 'bg-primary/25'}`}
                        style={{
                          height: inView ? `${month.value}%` : '0%',
                          transitionDelay: `${i * 90}ms`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-fg-subtle whitespace-nowrap">{month.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 매체 비중 도넛 */}
            <div className="sm:w-44 rounded-xl border border-border-soft bg-surface-2/60 p-3">
              <p className="text-[11px] font-medium text-fg-subtle">매체별 광고비 비중</p>
              <div className="mt-2 flex sm:flex-col items-center gap-3">
                <svg viewBox="0 0 36 36" className="w-20 h-20 shrink-0 -rotate-0">
                  <circle cx="18" cy="18" r="15.915" fill="none" strokeWidth="5" className="stroke-surface-3" />
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.label}
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      strokeWidth="5"
                      stroke={seg.color}
                      strokeDasharray={`${inView ? seg.percent : 0} ${inView ? 100 - seg.percent : 100}`}
                      strokeDashoffset={seg.offset}
                      className="transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none"
                    />
                  ))}
                </svg>
                <ul className="space-y-1">
                  {MEDIA_SHARE.map((media) => (
                    <li key={media.label} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: media.color }} />
                      {media.label}
                      <span className="font-semibold tabular-nums text-fg">{media.percent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </div>
  );
}
