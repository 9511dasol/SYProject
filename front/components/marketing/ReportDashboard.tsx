'use client';

import { useState } from 'react';
import DbDashboard from '@/components/marketing/DbDashboard';
import ExcelReportView from '@/components/marketing/ExcelReportView';
import type { ExcelReport } from '@/types/marketing';

export interface ImportedReport {
  id: string;
  label: string;
  /** 이 탭이 담당하는 기간 (예: '26년 5월') — 한 파일에 여러 달이 있으면 탭이 달마다 생긴다 */
  period?: string;
  data: ExcelReport;
  file: File;
}

export interface PendingLoad {
  id: string;
  label: string;
}

interface Props {
  importedReports: ImportedReport[];
  pendingLoads: PendingLoad[];
  onRemoveReport: (id: string) => void;
  onSaveReport: (id: string, replace: boolean) => void;
  onOpenUpload?: () => void;
  activeTab: string;
  onTabChange: (id: string) => void;
}

const DB_TAB = 'db';

export default function ReportDashboard({
  importedReports,
  pendingLoads,
  onRemoveReport,
  onSaveReport,
  onOpenUpload,
  activeTab,
  onTabChange,
}: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const hasImported = importedReports.length > 0;
  const hasPending = pendingLoads.length > 0;
  const showTabs = hasImported || hasPending;
  const activeReport = importedReports.find((r) => r.id === activeTab);

  function handleSave(id: string, replace: boolean) {
    setConfirmId(null);
    onSaveReport(id, replace);
  }

  return (
    <div className="space-y-4">
      {/* 탭 바 */}
      {showTabs && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {/* 저장된 리포트 */}
          <button
            onClick={() => onTabChange(DB_TAB)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
              activeTab === DB_TAB
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg'
            }`}
          >
            <i className="bx bx-data text-sm" />
            저장된 리포트
          </button>

          {/* 가져온 리포트 탭들 — 파일에 5월·6월이 같이 있으면 달마다 탭이 하나씩 */}
          {importedReports.map((r, idx) => (
            <div
              key={r.id}
              className={`flex items-center rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 overflow-hidden ${
                activeTab === r.id
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg'
              }`}
            >
              <button
                onClick={() => onTabChange(r.id)}
                className="flex items-center gap-1.5 pl-3 pr-1.5 py-2"
              >
                <i className="bx bx-file text-sm" />
                <span className="max-w-27.5 truncate">
                  {r.period ?? r.data.period ?? `가져온 리포트 ${idx + 1}`}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveReport(r.id);
                }}
                aria-label={`${r.label} 닫기`}
                title={r.label}
                className={`pr-2 py-2 transition-opacity ${
                  activeTab === r.id
                    ? 'text-white/60 hover:text-white'
                    : 'text-fg-subtle hover:text-badge-danger-fg'
                }`}
              >
                <i className="bx bx-x text-sm" />
              </button>
            </div>
          ))}

          {/* 백그라운드 로딩 중인 탭들 */}
          {pendingLoads.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap bg-surface-2 text-fg-subtle shrink-0"
            >
              <span className="w-3 h-3 rounded-full border-2 border-border border-t-indigo-500 animate-spin shrink-0" />
              <span className="max-w-27.5 truncate">{p.label}</span>
              <span className="text-[10px] font-normal text-fg-subtle">불러오는 중…</span>
            </div>
          ))}
        </div>
      )}

      {/* 탭 콘텐츠 */}
      {activeTab === DB_TAB || !showTabs ? (
        <DbDashboard onOpenUpload={onOpenUpload} />
      ) : activeReport ? (
        <div className="space-y-3">
          {/* 액션 바 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-xs font-medium text-indigo-700 dark:text-indigo-300 truncate max-w-xs">
                <i className="bx bx-file text-sm shrink-0" />
                {activeReport.label}
              </span>
              <span className="text-xs text-fg-subtle shrink-0">{activeReport.data.period}</span>
            </div>

            {/* DB 저장 버튼 */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setConfirmId(activeReport.id)}
                disabled={confirmId === activeReport.id}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  confirmId === activeReport.id
                    ? 'bg-badge-warn-bg text-badge-warn-fg cursor-default'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20'
                }`}
              >
                <i className="bx bx-data text-sm" />
                DB 저장 / 덮어쓰기
              </button>
            </div>
          </div>

          {/* 교체 확인 배너 */}
          {confirmId === activeReport.id && (
            <div className="flex items-start gap-3 rounded-xl border border-badge-warn-bdr bg-badge-warn-bg px-4 py-3">
              <i className="bx bx-error text-badge-warn-fg text-lg shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-badge-warn-fg">기존 데이터를 교체하시겠습니까?</p>
                <p className="text-xs text-badge-warn-fg/80 mt-0.5">
                  <strong>{activeReport.data.period}</strong> 기간의 기존 데이터를 모두 삭제하고
                  현재 파일로 교체합니다. 이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-fg-muted hover:bg-surface-2 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => handleSave(activeReport.id, true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20"
                >
                  교체하기
                </button>
              </div>
            </div>
          )}

          <ExcelReportView data={activeReport.data} />
        </div>
      ) : null}
    </div>
  );
}
