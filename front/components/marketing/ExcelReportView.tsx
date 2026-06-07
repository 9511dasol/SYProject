'use client';

import { useState } from 'react';
import CommentSection from '@/components/marketing/CommentSection';
import type { BudgetRow, DailyTotalRow, ExcelReport, MediaSheetData, SaTotal } from '@/types/marketing';

// ── 포맷 유틸 ─────────────────────────────────────────────────────────────────
const f = {
  num: (v: number | null | undefined) =>
    v == null ? '-' : Math.round(v).toLocaleString('ko-KR'),
  won: (v: number | null | undefined) =>
    v == null || v === 0 ? '-' : Math.round(v).toLocaleString('ko-KR') + '원',
  pct: (v: number | null | undefined) =>
    v == null ? '-' : (v * 100).toFixed(2) + '%',
  cell: (v: string | number | null | undefined): string => {
    if (v == null) return '-';
    if (typeof v === 'number') {
      if (v === 0) return '0';
      if (Math.abs(v) < 1) return (v * 100).toFixed(2) + '%';
      if (Math.abs(v) > 100000) return Math.round(v).toLocaleString('ko-KR');
      return Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toFixed(2);
    }
    return String(v);
  },
};

const MEDIA_ORDER = ['네이버SA', '네이버BS', '카카오SA', '구글SA', '파워컨텐츠'];

const CATEGORY_LABEL: Record<string, string> = {
  naver_SA: '네이버SA',
  kakao_SA: '카카오SA',
  google_SA: '구글SA',
  'SA total': 'SA 합계',
  naver_BS: '네이버BS',
  'SA+BS total': 'SA+BS 합계',
  naver_Power: '파워컨텐츠',
  TOAL: '전체 합계',
};

const IS_TOTAL = (cat: string) =>
  cat.toLowerCase().includes('total') || cat === 'TOAL';

// ── 기간 헤더 ─────────────────────────────────────────────────────────────────
function PeriodBar({ period, info }: { period: string; info: ExcelReport['period_info'] }) {
  const prog = Math.round((info.elapsed_days / info.total_days) * 100);
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-blue-600 text-white rounded-xl">
      <span className="font-bold text-base">{period}</span>
      <div className="flex items-center gap-3 text-sm">
        <span className="bg-white/20 px-2.5 py-0.5 rounded-full">
          경과 {info.elapsed_days}/{info.total_days}일
        </span>
        <span className="bg-white/20 px-2.5 py-0.5 rounded-full">잔여 {info.remaining_days}일</span>
      </div>
      <div className="flex-1 min-w-30">
        <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full" style={{ width: `${prog}%` }} />
        </div>
      </div>
      <span className="text-sm font-semibold">{prog}%</span>
    </div>
  );
}

// ── SA TOTAL 비교 테이블 ──────────────────────────────────────────────────────
const IS_RATIO_ROW = (label: string) => ['YOY', 'MOM', 'WoW'].includes(label);

function SaTotalTable({ data }: { data: SaTotal }) {
  return (
    <div className="overflow-x-auto data-table">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap sticky left-0 td-sticky z-10">
              구분
            </th>
            {data.headers.map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const isRatio = IS_RATIO_ROW(row.label);
            const isCurrent = row.label === '당월' || row.label === '금주';
            return (
              <tr
                key={row.label}
                className={
                  isCurrent
                    ? 'tr-current'
                    : isRatio
                      ? 'bg-amber-50/60 dark:bg-amber-950/20 border-b border-slate-100 dark:border-border'
                      : ''
                }
              >
                <td className={`px-3 py-2 whitespace-nowrap sticky left-0 z-10 font-medium td-sticky
                  ${isCurrent ? '' : isRatio ? 'text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                  {row.label}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {row.date || '-'}
                </td>
                {(['impressions', 'clicks', 'ctr', 'cpc', 'cost_vat', 'cost_markup',
                   'total_conv', 'conv_rate', 'conv_cost', 'total_conv_ex', 'conv_rate_ex',
                   'conv_cost_ex', 'signup', 'signup_rate', 'purchase', 'purchase_rate',
                   'revenue', 'roas', 'revenue_per_purchase'] as const).map((key) => {
                  const v = row[key];
                  let display: string;
                  if (isRatio) {
                    display = v === 0 ? '0%' : `${(v * 100).toFixed(1)}%`;
                  } else {
                    display = f.cell(v);
                  }
                  const isNeg = isRatio && v < 0;
                  const isPos = isRatio && v > 0;
                  return (
                    <td
                      key={key}
                      className={`px-3 py-2 text-right tabular-nums whitespace-nowrap
                        ${isNeg ? 'text-red-600 dark:text-red-400' : isPos ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 예산 현황 테이블 ───────────────────────────────────────────────────────────
function BudgetTable({ rows }: { rows: BudgetRow[] }) {
  return (
    <div className="overflow-x-auto data-table">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {['매체', '예산', '집행액', '소진율', '노출', '클릭', '광고비(VAT)', '전환수', '전환율', '전환단가'].map((h) => (
              <th key={h} className="px-3 py-2.5 text-xs font-semibold text-right first:text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isTotal = IS_TOTAL(row.category);
            return (
              <tr key={row.category} className={isTotal ? 'tr-total' : ''}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {CATEGORY_LABEL[row.category] ?? row.category}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{f.won(row.budget)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.won(row.spent)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium badge
                      ${row.burn_rate >= 0.8 ? 'badge-success' : row.burn_rate >= 0.5 ? 'badge-warn' : 'badge-danger'}`}
                  >
                    {f.pct(row.burn_rate)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{f.num(row.impressions)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.num(row.clicks)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.won(row.cost_vat)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.num(row.total_conv)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.pct(row.conv_rate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.conv_cost > 0 ? f.won(row.conv_cost) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 일별 합산 테이블 ───────────────────────────────────────────────────────────
function DailyTotalTable({ rows }: { rows: DailyTotalRow[] }) {
  return (
    <div className="overflow-x-auto data-table max-h-80 overflow-y-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 sticky-head">
          <tr>
            {['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비', '전환수', '전환율', '전환단가'].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold text-right first:text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.date} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.date.slice(5)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.num(r.impressions)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.num(r.clicks)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.pct(r.ctr)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.num(r.cpc)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.won(r.cost)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.total_conv.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.pct(r.conv_rate)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conv_cost > 0 ? f.num(r.conv_cost) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 매체별 상세 테이블 ─────────────────────────────────────────────────────────
function MediaTable({ data }: { data: MediaSheetData }) {
  return (
    <div className="overflow-x-auto data-table max-h-96 overflow-y-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 sticky-head z-10">
          <tr>
            {data.headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 font-semibold text-right first:text-left whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* TOTAL 행 */}
          <tr className="tr-total sticky top-8.25 z-10">
            {data.total.map((v, i) => (
              <td key={i} className="px-3 py-2 text-right first:text-left tabular-nums whitespace-nowrap">
                {i === 0 ? 'TOTAL' : f.cell(v)}
              </td>
            ))}
          </tr>
          {/* 일별 데이터 */}
          {data.daily.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'tr-even' : 'tr-odd'}>
              {row.map((v, ci) => (
                <td key={ci} className="px-3 py-1.5 text-right first:text-left tabular-nums whitespace-nowrap">
                  {f.cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function ExcelReportView({
  data,
  onClose,
}: {
  data: ExcelReport;
  onClose?: () => void;
}) {
  const mediaLabels = MEDIA_ORDER.filter((l) => l in data.media);
  const [activeTab, setActiveTab] = useState<string>('summary');

  const TABS = [{ id: 'summary', label: '📊 요약' }, ...mediaLabels.map((l) => ({ id: l, label: l }))];

  return (
    <div className="rounded-2xl bg-white dark:bg-surface shadow-sm border border-slate-100 dark:border-border overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-border">
        <div className="flex items-center gap-2">
          <i className="bx bx-file text-blue-500 dark:text-blue-400 text-xl" />
          <span className="font-semibold text-slate-800 dark:text-fg">Excel 리포트</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 dark:text-fg-subtle hover:text-slate-600 dark:hover:text-fg transition-colors">
            <i className="bx bx-x text-xl" />
          </button>
        )}
      </div>

      {/* 기간 바 */}
      <div className="px-5 pt-4">
        <PeriodBar period={data.period} info={data.period_info} />
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 dark:border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors shrink-0 ${
              activeTab === tab.id
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 dark:border-blue-400'
                : 'text-slate-500 dark:text-fg-muted hover:text-slate-700 dark:hover:text-fg hover:bg-slate-50 dark:hover:bg-surface-2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-5">
        {/* 요약 탭 */}
        {activeTab === 'summary' && (
          <>
            {data.sa_total?.rows?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-fg-muted mb-2">■ SA 전체 비교 (전년/전월/당월/YOY/MOM/전주/금주/WoW)</h3>
                <SaTotalTable data={data.sa_total} />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-fg-muted mb-2">■ 매체별 예산 현황</h3>
              <BudgetTable rows={data.budget_table} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-fg-muted mb-2">■ SA 일별 합산</h3>
              <DailyTotalTable rows={data.daily_total} />
            </div>
            <CommentSection text={data.comment} />
          </>
        )}

        {/* 매체별 탭 */}
        {mediaLabels.includes(activeTab) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-fg-muted">■ {activeTab} 일별 데이터</h3>
              <span className="text-xs text-slate-400 dark:text-fg-subtle">{data.media[activeTab].daily.length}일</span>
            </div>
            <MediaTable data={data.media[activeTab]} />
          </div>
        )}
      </div>
    </div>
  );
}
