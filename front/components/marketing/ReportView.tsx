'use client';

import { useState } from 'react';
import type { MediaDailyRow, MediaSummary, ReportData, RowDiff, RowFormData } from '@/types/marketing';
import CommentSection from '@/components/marketing/CommentSection';
import RowEditorModal from '@/components/marketing/RowEditorModal';
import { deleteMarketingRow, upsertMarketingRow } from '@/lib/marketingClient';

const fmt = {
  num: (v: number) => Math.round(v).toLocaleString('ko-KR'),
  pct: (v: number) => (v * 100).toFixed(2) + '%',
  won: (v: number) => Math.round(v).toLocaleString('ko-KR') + '원',
  dec: (v: number) => v.toFixed(1),
};

const MEDIA_ORDER = ['네이버SA', '네이버BS', '카카오SA', '구글SA', '파워컨텐츠'];

// ── pending 타입 ──────────────────────────────────────────────────────────────
type PendingEntry = RowFormData | 'deleted';
type PendingState = Record<string, Record<string, PendingEntry>>;
type RowPendingStatus = 'added' | 'edited' | 'deleted';
type EnrichedRow = MediaDailyRow & { pendingStatus?: RowPendingStatus };

function formToDisplayRow(form: RowFormData): MediaDailyRow {
  const imp = form.impressions;
  const clk = form.clicks;
  const cst = form.cost;
  const tc = form.conversions;
  const rev = form.conversion_revenue;
  return {
    date: form.report_date,
    impressions: imp,
    clicks: clk,
    cost: cst,
    ctr: imp > 0 ? clk / imp : 0,
    cpc: clk > 0 ? cst / clk : 0,
    total_conv: tc,
    conv_rate: clk > 0 ? tc / clk : 0,
    conv_cost: tc > 0 ? cst / tc : 0,
    signup: form.signup,
    purchase: form.purchase,
    revenue: rev,
    apply: form.apply,
    roas: cst > 0 ? rev / cst : 0,
  };
}

function getMergedRows(
  original: MediaDailyRow[],
  tabPending: Record<string, PendingEntry>,
): EnrichedRow[] {
  const result: EnrichedRow[] = [];
  const originalDates = new Set(original.map((r) => r.date));

  for (const row of original) {
    const p = tabPending[row.date];
    if (!p) result.push(row);
    else if (p === 'deleted') result.push({ ...row, pendingStatus: 'deleted' });
    else result.push({ ...formToDisplayRow(p), pendingStatus: 'edited' });
  }

  for (const [date, p] of Object.entries(tabPending)) {
    if (p !== 'deleted' && !originalDates.has(date)) {
      result.push({ ...formToDisplayRow(p), pendingStatus: 'added' });
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ── KPI 카드 ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-surface-2 border border-slate-100 dark:border-border shadow-sm px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-slate-400 dark:text-fg-subtle">{label}</span>
      <span className="text-lg font-semibold text-slate-800 dark:text-fg tabular-nums">{value}</span>
      {sub && <span className="text-xs text-slate-400 dark:text-fg-subtle tabular-nums">{sub}</span>}
    </div>
  );
}

// ── 매체별 요약 테이블 ────────────────────────────────────────────────────────
function SummaryTable({ rows }: { rows: MediaSummary[] }) {
  const headers = ['매체', '노출', '클릭', 'CTR', 'CPC', '광고비', '전환수', '전환율', '회원가입', '구매완료', 'ROAS'];
  return (
    <div className="overflow-x-auto data-table">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
              <td className="px-3 py-2 font-medium whitespace-nowrap">{r.label}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.num(r.impressions)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.num(r.clicks)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.pct(r.ctr)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.num(r.cpc)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.won(r.cost)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.dec(r.total_conv)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.pct(r.ctr > 0 ? r.total_conv / r.clicks : 0)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.dec(r.signup)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.dec(r.purchase)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{fmt.pct(r.roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── diff 배지 ─────────────────────────────────────────────────────────────────
function DiffBadge({ type }: { type: 'added' | 'updated' }) {
  if (type === 'added') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 leading-none shrink-0">
        <i className="bx bx-plus text-[9px]" />신규
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 leading-none shrink-0">
      <i className="bx bx-transfer-alt text-[9px]" />교체
    </span>
  );
}

// ── 미저장 변경 배지 ──────────────────────────────────────────────────────────
function PendingBadge({ type }: { type: RowPendingStatus }) {
  if (type === 'added') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 leading-none shrink-0">
        <i className="bx bx-plus text-[9px]" />추가
      </span>
    );
  }
  if (type === 'edited') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200 leading-none shrink-0">
        <i className="bx bx-pencil text-[9px]" />수정
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 leading-none shrink-0">
      <i className="bx bx-trash text-[9px]" />삭제
    </span>
  );
}

// ── 행 상세 패널 지표 아이템 ──────────────────────────────────────────────────
function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-slate-50 dark:bg-surface-2 border border-slate-100 dark:border-border px-3 py-2.5">
      <span className="text-[10px] font-semibold text-slate-400 dark:text-fg-subtle uppercase tracking-wider leading-none">
        {label}
      </span>
      <span className="text-sm font-bold text-slate-800 dark:text-fg tabular-nums mt-0.5">{value}</span>
    </div>
  );
}

// ── 행 상세 모달 ──────────────────────────────────────────────────────────────
interface RowDetailModalProps {
  row: EnrichedRow;
  mediaLabel: string;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onClose: () => void;
}

function RowDetailModal({ row, mediaLabel, editable, onEdit, onDelete, onRestore, onClose }: RowDetailModalProps) {
  const isKakao = mediaLabel === '카카오SA';
  const ps = row.pendingStatus;
  const isDeleted = ps === 'deleted';

  const borderColor = isDeleted
    ? 'border-red-200'
    : ps === 'edited'
      ? 'border-orange-200'
      : ps === 'added'
        ? 'border-blue-200'
        : 'border-slate-200';

  const headerBg = isDeleted
    ? 'bg-red-50/60'
    : ps === 'edited'
      ? 'bg-orange-50/60'
      : ps === 'added'
        ? 'bg-blue-50/60'
        : 'bg-slate-50/60';

  const iconBg = isDeleted
    ? 'bg-red-100 text-red-500'
    : ps === 'edited'
      ? 'bg-orange-100 text-orange-500'
      : ps === 'added'
        ? 'bg-blue-100 text-blue-600'
        : 'bg-blue-100 text-blue-600';

  return (
    <div className="fixed inset-0 z-300 flex items-center justify-center p-4">
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 카드 */}
      <div className={`relative w-full max-w-lg rounded-2xl border ${borderColor} bg-white dark:bg-surface shadow-2xl flex flex-col max-h-[90vh]`}>

        {/* 헤더 */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-border ${headerBg} shrink-0`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
              <i className="bx bx-calendar text-sm" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-fg">{row.date}</span>
                {ps && <PendingBadge type={ps} />}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-fg-subtle">{mediaLabel}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="닫기"
          >
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        {/* 지표 (스크롤 가능) */}
        <div className={`flex-1 overflow-y-auto px-5 py-4 space-y-3 ${isDeleted ? 'opacity-50' : ''}`}>
          {/* 기본 지표 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <MetricItem label="노출수" value={fmt.num(row.impressions)} />
            <MetricItem label="클릭수" value={fmt.num(row.clicks)} />
            <MetricItem label="CTR" value={fmt.pct(row.ctr)} />
            <MetricItem label="CPC" value={fmt.num(row.cpc) + '원'} />
            <MetricItem label="광고비" value={fmt.won(row.cost)} />
          </div>

          {/* 전환 지표 (카카오SA 제외) */}
          {!isKakao && (
            <>
              <div className="flex items-center gap-2 py-0.5">
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">전환</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricItem label="전환수" value={fmt.dec(row.total_conv)} />
                <MetricItem label="전환율" value={fmt.pct(row.conv_rate)} />
                <MetricItem label="전환단가" value={row.conv_cost > 0 ? fmt.num(row.conv_cost) + '원' : '-'} />
                <MetricItem label="ROAS" value={fmt.pct(row.roas)} />
                <MetricItem label="회원가입" value={fmt.dec(row.signup)} />
                <MetricItem label="구매완료" value={fmt.dec(row.purchase)} />
                <MetricItem label="구매매출" value={row.revenue > 0 ? fmt.won(row.revenue) : '-'} />
                <MetricItem label="신청" value={fmt.dec(row.apply)} />
              </div>
            </>
          )}
        </div>

        {/* 액션 푸터 */}
        {editable && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-border bg-slate-50/60 dark:bg-surface-2/40 shrink-0">
            <span className="text-[11px] text-slate-400 dark:text-fg-subtle">
              {isDeleted ? '삭제 예정 — DB 저장 전까지 되돌릴 수 있습니다' : '행 데이터를 수정하거나 삭제할 수 있습니다'}
            </span>
            <div className="flex items-center gap-2">
              {isDeleted ? (
                <button
                  onClick={onRestore}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-fg-muted hover:bg-slate-100 dark:hover:bg-surface-2 border border-slate-200 dark:border-border transition-colors"
                >
                  <i className="bx bx-undo text-sm" />
                  삭제 취소
                </button>
              ) : (
                <>
                  <button
                    onClick={onDelete}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
                  >
                    <i className="bx bx-trash text-sm" />
                    삭제
                  </button>
                  <button
                    onClick={onEdit}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <i className="bx bx-pencil text-sm" />
                    수정
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── 일별 데이터 테이블 ────────────────────────────────────────────────────────
interface DailyTableProps {
  rows: EnrichedRow[];
  diff?: RowDiff;
  mediaLabel?: string;
  editable?: boolean;
  onEdit?: (row: MediaDailyRow) => void;
  onDelete?: (date: string) => void;
  onRestoreDelete?: (date: string) => void;
}

function DailyTable({ rows, diff, mediaLabel, editable, onEdit, onDelete, onRestoreDelete }: DailyTableProps) {
  const isKakao = mediaLabel === '카카오SA';
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const headers = isKakao
    ? ['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비']
    : ['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비', '전환수', '전환율', '전환단가', '회원가입', '구매완료', '구매매출', '신청', 'ROAS'];

  const displayRows = rows.filter(
    (r) => r.pendingStatus !== undefined || r.impressions > 0 || r.clicks > 0 || r.cost > 0,
  );
  const addedSet = new Set(diff?.added ?? []);
  const updatedSet = new Set(diff?.updated ?? []);

  const selectedRow = selectedDate
    ? (displayRows.find((r) => r.date === selectedDate) ?? null)
    : null;

  function handleRowClick(date: string) {
    if (!editable) return;
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  return (
    <div className="space-y-3">
      {/* 테이블 */}
      <div className="overflow-x-auto data-table">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="sticky top-0">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 font-medium whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => {
              const isSelected = selectedDate === r.date;
              const ps = r.pendingStatus;
              const isAdded = addedSet.has(r.date);
              const isUpdated = updatedSet.has(r.date);

              const rowBg = isSelected
                ? 'bg-blue-100 dark:bg-blue-950/60 border-l-4 border-l-blue-500'
                : ps === 'deleted'
                  ? 'bg-red-50 dark:bg-red-950/30 border-l-2 border-l-red-400'
                  : ps === 'edited'
                    ? 'bg-orange-50 dark:bg-orange-950/30 border-l-2 border-l-orange-400'
                    : ps === 'added'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-l-2 border-l-blue-400'
                      : isAdded
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-l-2 border-l-emerald-400'
                        : isUpdated
                          ? 'bg-amber-50 dark:bg-amber-950/30 border-l-2 border-l-amber-400'
                          : i % 2 === 0 ? 'tr-even' : 'tr-odd';

              const cellMuted = ps === 'deleted' && !isSelected;

              return (
                <tr
                  key={r.date}
                  onClick={() => handleRowClick(r.date)}
                  className={`${rowBg} ${editable ? 'cursor-pointer hover:brightness-95 transition-all duration-100' : ''}`}
                >
                  <td className={`px-3 py-2 font-medium whitespace-nowrap ${cellMuted ? 'text-slate-400 dark:text-fg-subtle line-through' : ''}`}>
                    <span className="flex items-center gap-1.5">
                      {r.date.slice(5)}
                      {ps && <PendingBadge type={ps} />}
                      {!ps && isAdded && <DiffBadge type="added" />}
                      {!ps && isUpdated && <DiffBadge type="updated" />}
                      {isSelected && !ps && (
                        <span className="ml-auto">
                          <i className="bx bx-chevron-right text-blue-500 text-sm" />
                        </span>
                      )}
                    </span>
                  </td>
                  {([
                    fmt.num(r.impressions),
                    fmt.num(r.clicks),
                    fmt.pct(r.ctr),
                    fmt.num(r.cpc),
                    fmt.won(r.cost),
                  ] as string[]).map((v, ci) => (
                    <td key={ci} className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>
                      {v}
                    </td>
                  ))}
                  {!isKakao && (
                    <>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{fmt.dec(r.total_conv)}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{fmt.pct(r.conv_rate)}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{r.conv_cost > 0 ? fmt.num(r.conv_cost) : '-'}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{fmt.dec(r.signup)}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{fmt.dec(r.purchase)}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{r.revenue > 0 ? fmt.won(r.revenue) : '-'}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{fmt.dec(r.apply)}</td>
                      <td className={`px-3 py-2 tabular-nums text-right ${cellMuted ? 'text-slate-300' : 'text-slate-600'}`}>{fmt.pct(r.roas)}</td>
                    </>
                  )}
                </tr>
              );
            })}

            {displayRows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-400 dark:text-fg-subtle">
                  {editable
                    ? <span>데이터 없음 — <span className="text-blue-500">행 추가</span> 버튼으로 첫 데이터를 입력하세요</span>
                    : '데이터 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <RowDetailModal
          row={selectedRow}
          mediaLabel={mediaLabel ?? ''}
          editable={editable ?? false}
          onEdit={() => onEdit?.(selectedRow)}
          onDelete={() => onDelete?.(selectedRow.date)}
          onRestore={() => onRestoreDelete?.(selectedRow.date)}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

// ── 메인 리포트 뷰 ────────────────────────────────────────────────────────────
interface ReportViewProps {
  data: ReportData;
  onClose?: () => void;
  editable?: boolean;
  year?: number;
  month?: number;
  onRefresh?: () => void;
}

type ModalState = { mode: 'edit' | 'add'; data: RowFormData } | null;

export default function ReportView({ data, onClose, editable = false, year, month, onRefresh }: ReportViewProps) {
  const mediaLabels = editable ? MEDIA_ORDER : MEDIA_ORDER.filter((l) => l in data.daily);
  const hasDiff = Object.keys(data.diff ?? {}).some(
    (k) => (data.diff![k].added.length + data.diff![k].updated.length) > 0,
  );

  const [activeTab, setActiveTab] = useState<string>('summary');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [pending, setPending] = useState<PendingState>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { total } = data;
  const convRate = total.clicks > 0 ? total.total_conv / total.clicks : 0;

  const totalPendingCount = Object.entries(pending).reduce((sum, [tab, tabPending]) => {
    const originalDates = new Set((data.daily[tab] ?? []).map((r) => r.date));
    return (
      sum +
      Object.entries(tabPending).filter(([date, entry]) => {
        if (entry === 'deleted' && !originalDates.has(date)) return false;
        return true;
      }).length
    );
  }, 0);

  function openEdit(tab: string, row: MediaDailyRow) {
    setActionError(null);
    setModalState({
      mode: 'edit',
      data: {
        report_date: row.date,
        campaign_type: tab,
        impressions: Math.round(row.impressions),
        clicks: Math.round(row.clicks),
        cost: row.cost,
        conversions: Math.round(row.total_conv),
        conversion_revenue: row.revenue,
        signup: row.signup,
        purchase: row.purchase,
        apply: row.apply,
      },
    });
  }

  function openAdd(tab: string) {
    setActionError(null);
    const today = new Date();
    const defaultDate = today.toISOString().slice(0, 10);
    setModalState({
      mode: 'add',
      data: {
        report_date: defaultDate,
        campaign_type: tab,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversion_revenue: 0,
        signup: 0,
        purchase: 0,
        apply: 0,
      },
    });
  }

  function handleLocalSave(formData: RowFormData) {
    const tab = formData.campaign_type;
    setPending((prev) => ({
      ...prev,
      [tab]: { ...(prev[tab] ?? {}), [formData.report_date]: formData },
    }));
    setModalState(null);
  }

  function handleLocalDelete(tab: string, date: string) {
    setPending((prev) => ({
      ...prev,
      [tab]: { ...(prev[tab] ?? {}), [date]: 'deleted' },
    }));
  }

  function handleRestoreDelete(tab: string, date: string) {
    setPending((prev) => {
      const tabPending = { ...(prev[tab] ?? {}) };
      delete tabPending[date];
      return { ...prev, [tab]: tabPending };
    });
  }

  async function handleDbSave() {
    setSaving(true);
    setActionError(null);
    try {
      for (const [campaignType, tabPending] of Object.entries(pending)) {
        const originalDates = new Set((data.daily[campaignType] ?? []).map((r) => r.date));
        for (const [date, entry] of Object.entries(tabPending)) {
          if (entry === 'deleted') {
            if (originalDates.has(date)) await deleteMarketingRow(date, campaignType);
          } else {
            await upsertMarketingRow(entry);
          }
        }
      }
      setPending({});
      onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'DB 저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {modalState && (
        <RowEditorModal
          mode={modalState.mode}
          initialData={modalState.data}
          year={year}
          month={month}
          onClose={() => setModalState(null)}
          onSubmit={async (formData) => handleLocalSave(formData)}
        />
      )}

      <div className="mt-6 rounded-2xl bg-white dark:bg-surface shadow-sm border border-slate-100 dark:border-border overflow-hidden">
        {/* 리포트 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-border bg-slate-50/60 dark:bg-surface-2/40 gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <i className="bx bx-bar-chart-alt-2 text-xl text-blue-500 dark:text-blue-400 shrink-0" />
            <span className="font-semibold text-slate-800 dark:text-fg">{data.period} 분석 리포트</span>
            {hasDiff && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                DB 반영됨
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editable && totalPendingCount > 0 && (
              <button
                onClick={handleDbSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60 shadow-sm"
              >
                {saving
                  ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <i className="bx bx-save text-base" />
                }
                DB 저장
                <span className="bg-white/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {totalPendingCount}
                </span>
              </button>
            )}
            {onClose && (
              <button onClick={onClose} className="text-slate-400 dark:text-fg-subtle hover:text-slate-600 dark:hover:text-fg transition-colors" aria-label="닫기">
                <i className="bx bx-x text-xl" />
              </button>
            )}
          </div>
        </div>

        {/* 탭 바 */}
        <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 dark:border-border overflow-x-auto scrollbar-hide">
          {(['summary', ...mediaLabels] as string[]).map((tab) => {
            const tabDiff = tab !== 'summary' ? data.diff?.[tab] : undefined;
            const tabAdded = tabDiff?.added.length ?? 0;
            const tabUpdated = tabDiff?.updated.length ?? 0;
            const tabPendingCount = tab !== 'summary' ? Object.keys(pending[tab] ?? {}).length : 0;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setActionError(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
                  ${activeTab === tab
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 dark:border-blue-400'
                    : 'text-slate-500 dark:text-fg-muted hover:text-slate-700 dark:hover:text-fg'
                  }`}
              >
                {tab === 'summary' ? '요약' : tab}
                {tabAdded > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 leading-none">
                    +{tabAdded}
                  </span>
                )}
                {tabUpdated > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 leading-none">
                    ~{tabUpdated}
                  </span>
                )}
                {tabPendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 leading-none">
                    {tabPendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5 space-y-5">
          {/* 요약 탭 */}
          {activeTab === 'summary' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard label="총 노출" value={fmt.num(total.impressions)} />
                <KpiCard label="총 클릭" value={fmt.num(total.clicks)} />
                <KpiCard label="CTR" value={fmt.pct(total.ctr)} />
                <KpiCard label="CPC" value={fmt.num(total.cpc) + '원'} />
                <KpiCard label="총 광고비" value={fmt.won(total.cost)} />
                <KpiCard label="총 전환수" value={fmt.dec(total.total_conv)} sub={`전환율 ${fmt.pct(convRate)}`} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="회원가입" value={fmt.dec(total.signup)} />
                <KpiCard label="구매완료" value={fmt.dec(total.purchase)} />
                <KpiCard label="구매매출" value={fmt.won(total.revenue)} />
                <KpiCard label="ROAS" value={fmt.pct(total.roas)} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-600 dark:text-fg-muted mb-2">매체별 현황</h3>
                <SummaryTable rows={data.by_media} />
              </div>
              <CommentSection text={data.comment ?? ''} />
            </>
          )}

          {/* 매체별 일별 탭 */}
          {mediaLabels.includes(activeTab) && (() => {
            const tabDiff = data.diff?.[activeTab];
            const addedCount = tabDiff?.added.length ?? 0;
            const updatedCount = tabDiff?.updated.length ?? 0;
            const mergedRows = getMergedRows(data.daily[activeTab] ?? [], pending[activeTab] ?? {});
            const visibleCount = mergedRows.filter(
              (r) => r.pendingStatus !== undefined || r.impressions > 0,
            ).length;

            return (
              <div>
                {/* 섹션 헤더 */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-slate-600 dark:text-fg-muted">{activeTab} 일별 데이터</h3>
                    {addedCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                        <i className="bx bx-plus text-[10px]" />신규 {addedCount}일
                      </span>
                    )}
                    {updatedCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                        <i className="bx bx-refresh text-[10px]" />교체 {updatedCount}일
                      </span>
                    )}
                    {visibleCount > 0 && (
                      <span className="text-xs text-slate-400 dark:text-fg-subtle">{visibleCount}일 데이터</span>
                    )}
                    {editable && visibleCount > 0 && (
                      <span className="text-xs text-slate-400 dark:text-fg-subtle">· 행 클릭 시 상세 보기</span>
                    )}
                  </div>

                  {editable && (
                    <button
                      onClick={() => openAdd(activeTab)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:border-blue-300 transition-colors"
                    >
                      <i className="bx bx-plus text-sm" />
                      행 추가
                    </button>
                  )}
                </div>

                {actionError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 mb-2 text-xs">
                    <i className="bx bx-error-circle text-red-500 shrink-0" />
                    <span className="text-red-600 flex-1">{actionError}</span>
                    <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
                      <i className="bx bx-x" />
                    </button>
                  </div>
                )}

                <DailyTable
                  rows={mergedRows}
                  diff={tabDiff}
                  mediaLabel={activeTab}
                  editable={editable}
                  onEdit={(row) => openEdit(activeTab, row)}
                  onDelete={(date) => handleLocalDelete(activeTab, date)}
                  onRestoreDelete={(date) => handleRestoreDelete(activeTab, date)}
                />
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}
