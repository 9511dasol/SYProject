import type { RowPendingStatus } from '@/hooks/usePendingRows';
import type { Delta } from './compare';

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

// ── 기간 비교 증감 칩 ─────────────────────────────────────────────────────────

const DELTA_TONE_CLS = {
  success: 'text-badge-success-fg',
  danger: 'text-badge-danger-fg',
  neutral: 'text-fg-subtle',
} as const;

/** KPI 카드·비교 표에서 쓰는 "전월 +12.3%" 꼴 한 줄. delta 가 null 이면 '–' */
export function DeltaChip({ name, delta }: { name?: string; delta: Delta | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] leading-none tabular-nums whitespace-nowrap">
      {name && <span className="text-fg-subtle">{name}</span>}
      {delta ? (
        <span className={`font-semibold ${DELTA_TONE_CLS[delta.tone]}`}>{delta.text}</span>
      ) : (
        <span className="text-fg-subtle">–</span>
      )}
    </span>
  );
}

// ── KPI 카드 ─────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  sub,
  deltas,
  warning,
}: {
  label: string;
  value: string;
  sub?: string;
  /** 기간 비교 칩 줄 — 비교 데이터가 있을 때만 내려온다 */
  deltas?: React.ReactNode;
  /**
   * 임계값을 벗어났을 때의 한 줄 설명(예: "광고비가 매출보다 큽니다").
   * 같은 내용이 아래 액션 제안에도 나오지만, 지표를 훑는 사람은 카드만 보고
   * 지나가므로 숫자 바로 옆에서도 한 번 말해 준다.
   */
  warning?: string;
}) {
  return (
    <div
      className={
        warning
          ? 'rounded-xl bg-badge-danger-bg border border-badge-danger-bdr shadow-card px-4 py-3 flex flex-col gap-0.5'
          : 'rounded-xl bg-surface-2 border border-border shadow-card px-4 py-3 flex flex-col gap-0.5'
      }
    >
      <span className={warning ? 'text-xs text-badge-danger-fg' : 'text-xs text-fg-subtle'}>
        {label}
      </span>
      <span
        className={
          warning
            ? 'text-lg font-semibold text-badge-danger-fg tabular-nums'
            : 'text-lg font-semibold text-fg tabular-nums'
        }
      >
        {value}
      </span>
      {sub && <span className="text-xs text-fg-subtle tabular-nums">{sub}</span>}
      {warning && (
        <span className="text-[11px] font-medium text-badge-danger-fg flex items-start gap-1 mt-0.5">
          <i className="bx bx-error shrink-0 mt-px" aria-hidden />
          {warning}
        </span>
      )}
      {deltas && <span className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">{deltas}</span>}
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
