'use client';

import { useState } from 'react';
import type { MediaDailyRow, MediaSummary, ReportData, RowDiff } from '@/types/marketing';
import CommentSection from '@/components/marketing/CommentSection';

const fmt = {
  num: (v: number) => Math.round(v).toLocaleString('ko-KR'),
  pct: (v: number) => (v * 100).toFixed(2) + '%',
  won: (v: number) => Math.round(v).toLocaleString('ko-KR') + '원',
  dec: (v: number) => v.toFixed(1),
};

const MEDIA_ORDER = ['네이버SA', '네이버BS', '카카오SA', '구글SA', '파워컨텐츠'];

// ── KPI 카드 ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-100 shadow-sm px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-lg font-semibold text-slate-800 tabular-nums">{value}</span>
      {sub && <span className="text-xs text-slate-400 tabular-nums">{sub}</span>}
    </div>
  );
}

// ── 매체별 요약 테이블 ────────────────────────────────────────────────────────
function SummaryTable({ rows }: { rows: MediaSummary[] }) {
  const headers = ['매체', '노출', '클릭', 'CTR', 'CPC', '광고비', '전환수', '전환율', '회원가입', '구매완료', 'ROAS'];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
              <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.label}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.num(r.impressions)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.num(r.clicks)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.pct(r.ctr)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.num(r.cpc)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.won(r.cost)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.dec(r.total_conv)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.pct(r.ctr > 0 ? r.total_conv / r.clicks : 0)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.dec(r.signup)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.dec(r.purchase)}</td>
              <td className="px-3 py-2 tabular-nums text-right text-slate-600">{fmt.pct(r.roas)}</td>
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
        <i className="bx bx-plus text-[9px]" />
        신규
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 leading-none shrink-0">
      <i className="bx bx-transfer-alt text-[9px]" />
      교체
    </span>
  );
}

// ── 일별 데이터 테이블 ────────────────────────────────────────────────────────
function DailyTable({ rows, diff, mediaLabel }: { rows: MediaDailyRow[]; diff?: RowDiff; mediaLabel?: string }) {
  const isKakao = mediaLabel === '카카오SA';
  const headers = isKakao
    ? ['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비']
    : ['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비', '전환수', '전환율', '전환단가', '회원가입', '구매완료', '구매매출', '신청', 'ROAS'];

  const nonZero = rows.filter((r) => r.impressions > 0 || r.clicks > 0 || r.cost > 0);
  const addedSet = new Set(diff?.added ?? []);
  const updatedSet = new Set(diff?.updated ?? []);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nonZero.map((r, i) => {
            const isAdded = addedSet.has(r.date);
            const isUpdated = updatedSet.has(r.date);
            const rowBg = isAdded
              ? 'bg-emerald-50 border-l-2 border-l-emerald-400'
              : isUpdated
                ? 'bg-amber-50 border-l-2 border-l-amber-400'
                : i % 2 === 0
                  ? 'bg-white'
                  : 'bg-slate-50/50';
            return (
              <tr key={r.date} className={rowBg}>
                <td className="px-3 py-1.5 font-medium text-slate-600 whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    {r.date.slice(5)}
                    {isAdded && <DiffBadge type="added" />}
                    {isUpdated && <DiffBadge type="updated" />}
                  </span>
                </td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.num(r.impressions)}</td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.num(r.clicks)}</td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.pct(r.ctr)}</td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.num(r.cpc)}</td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.won(r.cost)}</td>
                {!isKakao && (
                  <>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.dec(r.total_conv)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.pct(r.conv_rate)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{r.conv_cost > 0 ? fmt.num(r.conv_cost) : '-'}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.dec(r.signup)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.dec(r.purchase)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{r.revenue > 0 ? fmt.won(r.revenue) : '-'}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.dec(r.apply)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-slate-600">{fmt.pct(r.roas)}</td>
                  </>
                )}
              </tr>
            );
          })}
          {nonZero.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-slate-400">
                데이터 없음
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 리포트 뷰 ────────────────────────────────────────────────────────────
export default function ReportView({ data, onClose }: { data: ReportData; onClose?: () => void }) {
  const mediaLabels = MEDIA_ORDER.filter((l) => l in data.daily);
  const hasDiff = Object.keys(data.diff ?? {}).some(
    (k) => (data.diff![k].added.length + data.diff![k].updated.length) > 0
  );
  const [activeTab, setActiveTab] = useState<string>('summary');

  const { total } = data;
  const convRate = total.clicks > 0 ? total.total_conv / total.clicks : 0;

  return (
    <div className="mt-6 rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2 flex-wrap">
          <i className="bx bx-bar-chart-alt-2 text-xl text-blue-500" />
          <span className="font-semibold text-slate-800">{data.period} 분석 리포트</span>
          {hasDiff && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              DB 반영됨 — 변경된 날짜를 확인하세요
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="닫기"
          >
            <i className="bx bx-x text-xl" />
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
        {(['summary', ...mediaLabels] as string[]).map((tab) => {
          const tabDiff = tab !== 'summary' ? data.diff?.[tab] : undefined;
          const tabAdded = tabDiff?.added.length ?? 0;
          const tabUpdated = tabDiff?.updated.length ?? 0;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
                ${activeTab === tab
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                  : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab === 'summary' ? '요약' : tab}
              {tabAdded > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 leading-none">
                  +{tabAdded}
                </span>
              )}
              {tabUpdated > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 leading-none">
                  ~{tabUpdated}
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
            {/* KPI 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label="총 노출" value={fmt.num(total.impressions)} />
              <KpiCard label="총 클릭" value={fmt.num(total.clicks)} />
              <KpiCard label="CTR" value={fmt.pct(total.ctr)} />
              <KpiCard label="CPC" value={fmt.num(total.cpc) + '원'} />
              <KpiCard label="총 광고비" value={fmt.won(total.cost)} />
              <KpiCard label="총 전환수" value={fmt.dec(total.total_conv)} sub={`전환율 ${fmt.pct(convRate)}`} />
            </div>

            {/* 세부 KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="회원가입" value={fmt.dec(total.signup)} />
              <KpiCard label="구매완료" value={fmt.dec(total.purchase)} />
              <KpiCard label="구매매출" value={fmt.won(total.revenue)} />
              <KpiCard label="ROAS" value={fmt.pct(total.roas)} />
            </div>

            {/* 매체별 요약 */}
            <div>
              <h3 className="text-sm font-medium text-slate-600 mb-2">매체별 현황</h3>
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
          return (
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h3 className="text-sm font-medium text-slate-600">{activeTab} 일별 데이터</h3>
                <div className="flex items-center gap-3">
                  {(addedCount > 0 || updatedCount > 0) && (
                    <div className="flex items-center gap-2 text-xs">
                      {addedCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                          <i className="bx bx-plus text-[10px]" />
                          신규 {addedCount}일
                        </span>
                      )}
                      {updatedCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
                          <i className="bx bx-refresh text-[10px]" />
                          교체 {updatedCount}일
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-xs text-slate-400">
                    {data.daily[activeTab]?.filter((r) => r.impressions > 0).length ?? 0}일 데이터
                  </span>
                </div>
              </div>
              <DailyTable rows={data.daily[activeTab] ?? []} diff={tabDiff} mediaLabel={activeTab} />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
