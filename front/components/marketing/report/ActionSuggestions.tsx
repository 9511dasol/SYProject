import type { ReportData } from '@/types/marketing';
import { type ActionSuggestion, buildActionSuggestions } from './actions';

/**
 * 요약 탭의 "액션 제안" — CTR·ROAS 등 지표 상태를 읽고 다음 행동을 제시한다.
 * 룰과 임계값은 actions.ts 에 있다. 제안이 하나도 없으면 조용한 안내 한 줄만 보여준다.
 */
export default function ActionSuggestions({ data }: { data: ReportData }) {
  const items = buildActionSuggestions(data);

  if (items.length === 0) {
    return (
      <p className="text-sm text-fg-subtle rounded-xl bg-surface-2 border border-border px-4 py-3">
        <i className="bx bx-check-circle mr-1" />
        지표에 특이 신호가 없습니다. 현재 운영 기조를 유지하세요.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <SuggestionCard key={`${item.metric}-${item.title}`} item={item} />
      ))}
    </div>
  );
}

const SEVERITY_META = {
  warn: { badge: 'badge-warn', icon: 'bx-error', label: '점검 필요' },
  good: { badge: 'badge-success', icon: 'bx-trending-up', label: '긍정 신호' },
} as const;

function SuggestionCard({ item }: { item: ActionSuggestion }) {
  const meta = SEVERITY_META[item.severity];
  return (
    <div className="rounded-xl bg-surface-2 border border-border shadow-card px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`badge ${meta.badge} shrink-0`}>
          <i className={`bx ${meta.icon} text-[10px]`} />
          {meta.label}
        </span>
        <span className="badge badge-neutral shrink-0">{item.metric}</span>
        <span className="text-sm font-semibold text-fg">{item.title}</span>
      </div>
      <p className="text-xs text-fg-subtle tabular-nums">{item.evidence}</p>
      <ul className="space-y-1">
        {item.actions.map((a) => (
          <li key={a} className="text-sm text-fg-muted flex items-start gap-1.5">
            <i className="bx bx-chevron-right text-primary mt-0.5 shrink-0" />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}
