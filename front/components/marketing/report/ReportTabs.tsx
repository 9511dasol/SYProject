import { mediaLabel } from '@/lib/marketingMeta';
import type { RowDiff } from '@/types/marketing';

interface ReportTabsProps {
  /** 'summary' 를 뺀 매체 탭 목록 */
  mediaTabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
  /** 서버가 알려준 매체별 변경 내역 */
  diff?: Record<string, RowDiff>;
  /** 매체별 미저장 변경 개수 */
  pendingCountOf: (tab: string) => number;
}

/** 탭 위 숫자 배지 — 신규(+3) · 교체(~2) · 미저장(5) */
function CountBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge ${tone} leading-none`}>{children}</span>;
}

export default function ReportTabs({
  mediaTabs,
  activeTab,
  onChange,
  diff,
  pendingCountOf,
}: ReportTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="리포트 탭"
      className="flex gap-1 px-4 pt-3 border-b border-border overflow-x-auto scrollbar-hide"
    >
      {['summary', ...mediaTabs].map((tab) => {
        const tabDiff = tab === 'summary' ? undefined : diff?.[tab];
        const added = tabDiff?.added.length ?? 0;
        const updated = tabDiff?.updated.length ?? 0;
        const pending = tab === 'summary' ? 0 : pendingCountOf(tab);
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
              ${isActive
                ? 'bg-primary-soft text-primary border-b-2 border-primary'
                : 'text-fg-muted hover:text-fg'}`}
          >
            {tab === 'summary' ? '요약' : mediaLabel(tab)}
            {added > 0 && <CountBadge tone="badge-success">+{added}</CountBadge>}
            {updated > 0 && <CountBadge tone="badge-warn">~{updated}</CountBadge>}
            {pending > 0 && <CountBadge tone="badge-info">{pending}</CountBadge>}
          </button>
        );
      })}
    </div>
  );
}
