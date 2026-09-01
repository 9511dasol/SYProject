'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  formatCompact as fmtCompact,
  formatCount,
  formatNumber as fmt,
  formatPercentChange as pctChange,
  formatSigned as fmtDiff,
} from '@/lib/format';
import { parseKeywordCompare } from '@/lib/keywordCompareClient';
import ScrollableTable from '@/components/ui/ScrollableTable';
import type { CompareResult, CompareRow, CompareSheet, RowStatus } from '@/types/keywordCompare';

// ── 상태 메타 ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<
  RowStatus,
  { label: string; icon: string; badgeCls: string; textCls: string }
> = {
  up:   { label: '증가', icon: 'bx-trending-up',  badgeCls: 'bg-emerald-100 text-emerald-700', textCls: 'text-emerald-600' },
  down: { label: '감소', icon: 'bx-trending-down', badgeCls: 'bg-rose-100    text-rose-700',    textCls: 'text-rose-600'    },
  new:  { label: '신규', icon: 'bx-plus-circle',   badgeCls: 'bg-violet-100  text-violet-700',  textCls: 'text-violet-600'  },
  gone: { label: '소멸', icon: 'bx-minus-circle',  badgeCls: 'bg-badge-neutral-bg text-badge-neutral-fg',   textCls: 'text-fg-subtle'   },
  same: { label: '유지', icon: 'bx-minus',         badgeCls: 'bg-blue-50     text-blue-500',    textCls: 'text-fg-subtle'   },
};

type SortKey =
  | 'keyword'
  | 'curr_conv'
  | 'prev_conv'
  | 'diff_conv'
  | 'curr_amount'
  | 'prev_amount'
  | 'diff_amount';

interface Filters {
  search: string;
  status: RowStatus | 'all';
  device: string;
  campaignType: string;
  convType: string;
}

type Phase = 'idle' | 'loading' | 'error' | 'result';

// ── 업로드 영역 ────────────────────────────────────────────────────────────────

function UploadZone({
  isDragging,
  onFile,
  onDragOver,
  onDragLeave,
  onDrop,
  fileInputRef,
}: {
  isDragging: boolean;
  onFile: (f: File) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* 배경 그라디언트 */}
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(37,99,235,0.08),transparent)]" />
      </div>

      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">
            Keyword Performance
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight mb-2">
            키워드 성과 비교
          </h1>
          <p className="text-sm text-fg-muted leading-relaxed">
            이번/이전 기간 전환 성과가 담긴 Excel 파일을 업로드하면
            <br className="hidden sm:block" />
            키워드별 증감을 자동으로 분석해 드립니다.
          </p>
        </div>

        {/* 드롭존 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`
            w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-4
            transition-all duration-200 cursor-pointer text-center focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-blue-500
            ${isDragging
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40 scale-[1.01]'
              : 'border-border bg-surface hover:border-blue-300 hover:bg-blue-50/40 dark:hover:border-blue-700 dark:hover:bg-blue-950/20'}
          `}
        >
          <span
            className={`
              flex items-center justify-center w-16 h-16 rounded-2xl shadow-sm transition-colors
              ${isDragging ? 'bg-blue-600' : 'bg-blue-50 dark:bg-blue-950 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40'}
            `}
          >
            <i className={`bx bx-cloud-upload text-4xl ${isDragging ? 'text-white' : 'text-blue-500'}`} />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">
              {isDragging ? '여기에 놓아주세요' : '파일을 드래그하거나 클릭하여 선택'}
            </p>
            <p className="text-xs text-fg-subtle mt-1">.xlsx 형식 지원</p>
          </div>
        </button>

        {/* .xls(구형 BIFF)는 서버에서 파싱할 수 없어 accept에서 뺀다 — 위 안내 문구도 .xlsx만 표기 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onFile(f); e.target.value = ''; }
          }}
        />

        {/* 사용 안내 */}
        <ol className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-fg-subtle">
          {['Excel 파일 업로드', '시트별 자동 파싱', '증감 필터·정렬'].map((t, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-surface-2 text-fg-muted flex items-center justify-center font-bold text-[10px]">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── 로딩 상태 ─────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
      <p className="text-sm font-medium text-fg-muted">파일 분석 중…</p>
      <p className="text-xs text-fg-subtle">시트별 데이터를 파싱하고 있습니다.</p>
    </div>
  );
}

// ── 오류 상태 ─────────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 text-center px-4">
      <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50">
        <i className="bx bx-error-circle text-3xl text-rose-500 dark:text-rose-400" />
      </span>
      <div>
        <p className="text-base font-semibold text-fg mb-1">파일 분석 실패</p>
        <p className="text-sm text-fg-muted max-w-sm leading-relaxed">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
          bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        <i className="bx bx-refresh" />
        다시 시도
      </button>
    </div>
  );
}

// ── 요약 카드 ─────────────────────────────────────────────────────────────────

function SummaryCards({ sheet }: { sheet: CompareSheet }) {
  const { summary } = sheet;
  const convPct = pctChange(summary.total_curr_conv, summary.total_prev_conv);
  const amtPct = pctChange(summary.total_curr_amount, summary.total_prev_amount);

  const convUp = summary.diff_conv > 0;
  const amtUp = summary.diff_amount > 0;

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {/* 전환수 */}
      <div className="rounded-2xl border border-border bg-surface-2 p-4 shadow-sm">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">전환수</p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-fg-subtle">이번</span>
            <span className="font-semibold text-fg">{fmt(summary.total_curr_conv)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-fg-subtle">이전</span>
            <span className="text-fg-muted">{fmt(summary.total_prev_conv)}</span>
          </div>
          <div className="pt-1.5 mt-1.5 border-t border-border flex justify-between items-center">
            <span className="text-xs text-fg-subtle">증감</span>
            <span className={`text-sm font-bold ${convUp ? 'text-emerald-600' : summary.diff_conv < 0 ? 'text-rose-600' : 'text-fg-subtle'}`}>
              {fmtDiff(summary.diff_conv)}
              {convPct && <span className="ml-1 text-xs font-medium opacity-70">({convPct})</span>}
            </span>
          </div>
        </div>
      </div>

      {/* 전환금액 */}
      <div className="rounded-2xl border border-border bg-surface-2 p-4 shadow-sm">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">전환금액</p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-fg-subtle">이번</span>
            <span className="font-semibold text-fg">{fmtCompact(summary.total_curr_amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-fg-subtle">이전</span>
            <span className="text-fg-muted">{fmtCompact(summary.total_prev_amount)}</span>
          </div>
          <div className="pt-1.5 mt-1.5 border-t border-border flex justify-between items-center">
            <span className="text-xs text-fg-subtle">증감</span>
            <span className={`text-sm font-bold ${amtUp ? 'text-emerald-600' : summary.diff_amount < 0 ? 'text-rose-600' : 'text-fg-subtle'}`}>
              {fmtDiff(summary.diff_amount)}
              {amtPct && <span className="ml-1 text-xs font-medium opacity-70">({amtPct})</span>}
            </span>
          </div>
        </div>
      </div>

      {/* 상태 분포 */}
      <div className="rounded-2xl border border-border bg-surface-2 p-4 shadow-sm">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">상태 분포</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {(
            [
              ['up',   summary.count_up],
              ['down', summary.count_down],
              ['new',  summary.count_new],
              ['gone', summary.count_gone],
              ['same', summary.count_same],
            ] as [RowStatus, number][]
          ).map(([s, cnt]) => {
            const m = STATUS_META[s];
            return (
              <div key={s} className="flex items-center gap-1.5">
                <i className={`bx ${m.icon} text-sm ${m.textCls}`} />
                <span className="text-xs text-fg-muted">{m.label}</span>
                <span className="ml-auto text-xs font-semibold text-fg">{cnt}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 필터 바 ───────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: RowStatus | 'all'; label: string }[] = [
  { value: 'all',  label: '전체' },
  { value: 'up',   label: '증가' },
  { value: 'down', label: '감소' },
  { value: 'new',  label: '신규' },
  { value: 'gone', label: '소멸' },
  { value: 'same', label: '유지' },
];

function FilterBar({
  sheet,
  filters,
  onChange,
}: {
  sheet: CompareSheet;
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
}) {
  const selectCls =
    'rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* 키워드 검색 */}
      <div className="relative flex-1 min-w-40">
        <i className="bx bx-search absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle text-sm" />
        <input
          type="text"
          placeholder="키워드 검색…"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border text-xs text-fg
            placeholder:text-fg-subtle bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-lg">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onChange({ status: value })}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
              ${filters.status === value
                ? 'bg-surface-3 text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'}`}
          >
            {value !== 'all' && (
              <i className={`bx ${STATUS_META[value as RowStatus].icon} mr-1`} />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* 캠페인유형 */}
      {sheet.campaign_types.length > 1 && (
        <select
          value={filters.campaignType}
          onChange={(e) => onChange({ campaignType: e.target.value })}
          className={selectCls}
        >
          <option value="">캠페인 전체</option>
          {sheet.campaign_types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      {/* 디바이스 */}
      {sheet.devices.length > 1 && (
        <select
          value={filters.device}
          onChange={(e) => onChange({ device: e.target.value })}
          className={selectCls}
        >
          <option value="">기기 전체</option>
          {sheet.devices.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}

      {/* 전환유형 */}
      {sheet.conv_types.length > 1 && (
        <select
          value={filters.convType}
          onChange={(e) => onChange({ convType: e.target.value })}
          className={selectCls}
        >
          <option value="">전환 전체</option>
          {sheet.conv_types.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── 테이블 헤더 셀 ─────────────────────────────────────────────────────────────

function ThCell({
  label,
  sortKey,
  currentSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey?: SortKey;
  currentSort?: { key: SortKey; dir: 'asc' | 'desc' };
  onSort?: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = currentSort?.key === sortKey;
  const cls = `px-3 py-2.5 text-xs font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap
    ${align === 'right' ? 'text-right' : 'text-left'}
    ${sortKey ? 'cursor-pointer select-none hover:text-fg' : ''}`;

  return (
    <th className={cls} onClick={() => sortKey && onSort?.(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey && (
          <i
            className={`bx text-[10px] transition-opacity
              ${active
                ? currentSort?.dir === 'asc' ? 'bx-chevron-up opacity-100' : 'bx-chevron-down opacity-100'
                : 'bx-chevron-down opacity-30'}`}
          />
        )}
      </span>
    </th>
  );
}

// ── 증감 셀 ───────────────────────────────────────────────────────────────────

function DiffCell({ value, bold = false }: { value: number; bold?: boolean }) {
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-fg-disabled';
  return (
    <td className={`px-3 py-2.5 text-right text-xs tabular-nums ${cls} ${bold ? 'font-semibold' : ''}`}>
      {fmtDiff(value)}
    </td>
  );
}

// ── 비교 테이블 ───────────────────────────────────────────────────────────────

function CompareTable({
  rows,
  sort,
  onSort,
}: {
  rows: CompareRow[];
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (k: SortKey) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <i className="bx bx-search-alt text-3xl text-fg-disabled" />
        <p className="text-sm text-fg-subtle">조건에 맞는 키워드가 없습니다.</p>
      </div>
    );
  }

  const thProps = { currentSort: sort, onSort };

  return (
    <>
      {/* 모바일 카드 뷰 */}
      <ul className="sm:hidden rounded-xl border border-border divide-y divide-border">
        {rows.map((row, i) => {
          const m = STATUS_META[row.status];
          return (
            <li key={i} className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.badgeCls}`}>
                  <i className={`bx ${m.icon} text-xs`} />
                  {m.label}
                </span>
                <span className="text-sm font-semibold text-fg leading-snug">{row.keyword}</span>
              </div>
              <p className="text-xs text-fg-subtle">
                {row.campaign_type} · {row.device} · {row.conv_type}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-fg-subtle">전환수</span>
                <span className="text-right">
                  <span className="text-fg font-medium">{fmt(row.curr_conv)}</span>
                  <span className="text-fg-subtle mx-1">→</span>
                  <span className="text-fg-muted">{fmt(row.prev_conv)}</span>
                  <span className={`ml-1.5 font-semibold ${STATUS_META[row.status].textCls}`}>
                    {fmtDiff(row.diff_conv)}
                  </span>
                </span>
                <span className="text-fg-subtle">금액</span>
                <span className="text-right">
                  <span className="text-fg font-medium">{fmtCompact(row.curr_amount)}</span>
                  <span className="text-fg-subtle mx-1">→</span>
                  <span className="text-fg-muted">{fmtCompact(row.prev_amount)}</span>
                  <span className={`ml-1.5 font-semibold ${STATUS_META[row.status].textCls}`}>
                    {fmtDiff(row.diff_amount)}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        데스크톱 테이블 뷰 — ScrollableTable 로 감싸 태블릿 폭(768px)에서도 표가
        잘렸다는 걸 알 수 있게 한다. min-w-215(860px)라 sm 에서도 넘친다.
      */}
      <div className="hidden sm:block">
        {/* styled={false} — 이 표는 thead·tbody 배경과 셀 색을 스스로 다 정한다 */}
        <ScrollableTable styled={false} hint="옆으로 밀어서 나머지 지표를 볼 수 있어요">
          <table className="w-full min-w-215 border-collapse text-xs">
        <thead className="bg-surface-2 border-b border-border">
          <tr>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide w-16">구분</th>
            <ThCell label="캠페인유형" />
            <ThCell label="키워드" sortKey="keyword" {...thProps} />
            <ThCell label="기기" />
            <ThCell label="전환유형" />
            <ThCell label="이번 전환수" sortKey="curr_conv" align="right" {...thProps} />
            <ThCell label="이전 전환수" sortKey="prev_conv" align="right" {...thProps} />
            <ThCell label="전환수 증감" sortKey="diff_conv" align="right" {...thProps} />
            <ThCell label="이번 금액" sortKey="curr_amount" align="right" {...thProps} />
            <ThCell label="이전 금액" sortKey="prev_amount" align="right" {...thProps} />
            <ThCell label="금액 증감" sortKey="diff_amount" align="right" {...thProps} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((row, i) => {
            const m = STATUS_META[row.status];
            return (
              <tr key={i} className="hover:bg-surface-2/60 transition-colors">
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${m.badgeCls}`}>
                    <i className={`bx ${m.icon} text-xs`} />
                    {m.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-fg-muted max-w-35 truncate">{row.campaign_type}</td>
                <td className="px-3 py-2.5 font-medium text-fg">{row.keyword}</td>
                <td className="px-3 py-2.5 text-fg-muted">{row.device}</td>
                <td className="px-3 py-2.5 text-fg-muted">{row.conv_type}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg font-medium">{fmt(row.curr_conv)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-subtle">{fmt(row.prev_conv)}</td>
                <DiffCell value={row.diff_conv} bold />
                <td className="px-3 py-2.5 text-right tabular-nums text-fg font-medium">{fmt(row.curr_amount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-subtle">{fmt(row.prev_amount)}</td>
                <DiffCell value={row.diff_amount} bold />
              </tr>
            );
          })}
        </tbody>
          </table>
        </ScrollableTable>
      </div>
    </>
  );
}

// ── 결과 뷰 ───────────────────────────────────────────────────────────────────

function ResultView({
  result,
  onReset,
}: {
  result: CompareResult;
  onReset: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    device: '',
    campaignType: '',
    convType: '',
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'diff_conv',
    dir: 'desc',
  });

  const sheet = result.sheets[activeIdx];

  const handleFilterChange = useCallback((partial: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' },
    );
  }, []);

  const filteredRows = useMemo(() => {
    let rows = sheet.rows.slice();

    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) => r.keyword.toLowerCase().includes(q));
    }
    if (filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.device) {
      rows = rows.filter((r) => r.device === filters.device);
    }
    if (filters.campaignType) {
      rows = rows.filter((r) => r.campaign_type === filters.campaignType);
    }
    if (filters.convType) {
      rows = rows.filter((r) => r.conv_type === filters.convType);
    }

    const { key, dir } = sort;
    rows.sort((a, b) => {
      const av = a[key] as string | number;
      const bv = b[key] as string | number;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [sheet, filters, sort]);

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* 상단 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            Keyword Performance
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
            키워드 성과 비교
          </h1>
          {sheet.period && (
            <p className="text-sm text-fg-muted mt-0.5">{sheet.period}</p>
          )}
        </div>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium
            border border-border bg-surface-2 text-fg-muted
            hover:bg-surface-3 hover:border-border
            transition-colors shadow-sm"
        >
          <i className="bx bx-upload" />
          새 파일 업로드
        </button>
      </div>

      {/* 시트 탭 */}
      {result.sheets.length > 1 && (
        <div className="flex gap-1 p-1 bg-surface-2 rounded-xl w-fit">
          {result.sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => { setActiveIdx(i); setFilters({ search: '', status: 'all', device: '', campaignType: '', convType: '' }); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                ${activeIdx === i
                  ? 'bg-surface-3 text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* 요약 카드 */}
      <SummaryCards sheet={sheet} />

      {/* 필터 바 */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
        <FilterBar sheet={sheet} filters={filters} onChange={handleFilterChange} />
      </div>

      {/* 결과 카운트 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-muted">
          총 <span className="font-semibold text-fg">{formatCount(filteredRows.length)}</span>건
          {filteredRows.length !== sheet.rows.length && (
            <span className="ml-1 text-fg-subtle">(전체 {sheet.rows.length}건 중)</span>
          )}
        </span>
        {(filters.search || filters.status !== 'all' || filters.device || filters.campaignType || filters.convType) && (
          <button
            onClick={() => setFilters({ search: '', status: 'all', device: '', campaignType: '', convType: '' })}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <i className="bx bx-x" />
            필터 초기화
          </button>
        )}
      </div>

      {/* 비교 테이블 */}
      <CompareTable rows={filteredRows} sort={sort} onSort={handleSort} />
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function FileCompareClient() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      setError('Excel 파일(.xlsx)만 업로드할 수 있습니다.');
      setPhase('error');
      return;
    }
    setPhase('loading');
    setError(null);
    try {
      const data = await parseKeywordCompare(file);
      setResult(data);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 파싱에 실패했습니다.');
      setPhase('error');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleReset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setError(null);
  }, []);

  if (phase === 'loading') return <LoadingState />;
  if (phase === 'error') return <ErrorState message={error ?? '알 수 없는 오류'} onRetry={handleReset} />;
  if (phase === 'result' && result) return <ResultView result={result} onReset={handleReset} />;

  return (
    <UploadZone
      isDragging={isDragging}
      onFile={handleFile}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      fileInputRef={fileInputRef}
    />
  );
}
