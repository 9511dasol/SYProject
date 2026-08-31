import type { RowPendingStatus } from '@/hooks/usePendingRows';

/**
 * 리포트 표의 작은 표시 요소들.
 *
 * 전부 `bg-emerald-100 text-emerald-700` 처럼 원색 팔레트로 적혀 있었고 dark: 변형이
 * 없어서 다크모드에서 배지가 흰 알약처럼 떴다. globals.css 의 .badge 토큰으로 바꿨다.
 */

// ── DB 반영 결과 배지 (서버가 준 diff) ────────────────────────────────────────

const DIFF_META = {
  added: { cls: 'badge-success', icon: 'bx-plus', label: '신규' },
  updated: { cls: 'badge-warn', icon: 'bx-transfer-alt', label: '교체' },
} as const;

export function DiffBadge({ type }: { type: 'added' | 'updated' }) {
  const meta = DIFF_META[type];
  return (
    <span className={`badge ${meta.cls} shrink-0`}>
      <i className={`bx ${meta.icon} text-[9px]`} />
      {meta.label}
    </span>
  );
}

// ── 미저장 변경 배지 ──────────────────────────────────────────────────────────

const PENDING_META: Record<RowPendingStatus, { cls: string; icon: string; label: string }> = {
  added: { cls: 'badge-info', icon: 'bx-plus', label: '추가' },
  edited: { cls: 'badge-amber', icon: 'bx-pencil', label: '수정' },
  deleted: { cls: 'badge-danger', icon: 'bx-trash', label: '삭제' },
};

export function PendingBadge({ type }: { type: RowPendingStatus }) {
  const meta = PENDING_META[type];
  return (
    <span className={`badge ${meta.cls} shrink-0`}>
      <i className={`bx ${meta.icon} text-[9px]`} />
      {meta.label}
    </span>
  );
}

// ── KPI 카드 ─────────────────────────────────────────────────────────────────

export function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-border shadow-card px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-fg-subtle">{label}</span>
      <span className="text-lg font-semibold text-fg tabular-nums">{value}</span>
      {sub && <span className="text-xs text-fg-subtle tabular-nums">{sub}</span>}
    </div>
  );
}

// ── 행 상세 모달의 지표 한 칸 ─────────────────────────────────────────────────

export function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface-2 border border-border px-3 py-2.5">
      <span className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider leading-none">
        {label}
      </span>
      <span className="text-sm font-bold text-fg tabular-nums mt-0.5">{value}</span>
    </div>
  );
}
