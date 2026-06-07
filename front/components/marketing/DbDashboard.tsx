'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDbExportResult,
  getDbExportStatus,
  getPeriods,
  getSummary,
  saveFileWithPicker,
  startDbExportTask,
} from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import type { ReportData } from '@/types/marketing';
import ReportView from '@/components/marketing/ReportView';
import Button from '@/components/ui/Button';

type Period = { year: number; month: number };
type DlPhase = 'idle' | 'pending' | 'processing' | 'done' | 'error';

interface DownloadTask {
  taskId: string;
  filename: string;
  progress: number;
  phase: DlPhase;
  error?: string;
}

interface DbDashboardProps {
  onOpenUpload?: () => void;
}

// ── 새 기간 선택 팝오버 ────────────────────────────────────────────────────────

function NewPeriodPopover({
  onSelect,
  onClose,
}: {
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const selectClass =
    'flex-1 rounded-lg border border-slate-200 dark:border-border px-2 py-1.5 text-xs text-slate-700 dark:text-fg bg-white dark:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="absolute top-full mt-2 right-0 z-20 w-56 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-surface shadow-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-600 dark:text-fg-muted">새 기간 추가</p>
      <div className="flex gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectClass}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-fg-muted hover:bg-slate-100 dark:hover:bg-surface-2 transition-colors"
        >
          취소
        </button>
        <button
          onClick={() => { onSelect(year, month); onClose(); }}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          이동
        </button>
      </div>
    </div>
  );
}

// ── 다운로드 진행률 토스트 ────────────────────────────────────────────────────

function DownloadProgressToast({ task, onDismiss }: { task: DownloadTask; onDismiss: () => void }) {
  const isDone = task.phase === 'done';
  const isError = task.phase === 'error';
  const isActive = !isDone && !isError;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-200 w-72 rounded-2xl shadow-xl shadow-black/10 border overflow-hidden transition-all
        ${isError ? 'bg-red-600 border-red-500 text-white'
          : isDone ? 'bg-emerald-600 border-emerald-500 text-white'
          : 'bg-slate-900 border-slate-700 text-white'}`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isActive && <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-blue-400 animate-spin shrink-0" />}
          {isDone && <i className="bx bx-check-circle text-xl shrink-0" />}
          {isError && <i className="bx bx-error-circle text-xl shrink-0" />}
          <span className="text-sm font-semibold truncate">
            {isError ? 'Excel 생성 실패' : isDone ? 'Excel 준비 완료' : 'Excel 생성 중…'}
          </span>
        </div>
        {(isDone || isError) && (
          <button onClick={onDismiss} aria-label="닫기" className="opacity-70 hover:opacity-100 transition-opacity shrink-0 ml-2">
            <i className="bx bx-x text-lg" />
          </button>
        )}
      </div>
      {isActive && (
        <div className="px-4 pb-1">
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${task.progress}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-1 text-right tabular-nums">{task.progress}%</p>
        </div>
      )}
      <div className="px-4 pb-3 text-xs opacity-75 truncate">
        {isError ? task.error : task.filename}
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export default function DbDashboard({ onOpenUpload }: DbDashboardProps = {}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Period | null>(null);
  const [dlTask, setDlTask] = useState<DownloadTask | null>(null);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const newPeriodRef = useRef<HTMLDivElement>(null);

  // ── 기간 목록 ─────────────────────────────────────────────────────────────
  const {
    data: periods = [],
    isLoading: periodsLoading,
    error: periodsError,
  } = useQuery({
    queryKey: queryKeys.periods(),
    queryFn: getPeriods,
    select: (data) => {
      // 선택 기간 초기화: 아직 선택 안 됐으면 첫 번째 항목으로
      if (!selected && data.length > 0) {
        setSelected(data[0]);
      }
      return data;
    },
  });

  // 현재 선택이 DB 목록에 없는 새 기간인지
  const isNewPeriod =
    selected !== null && !periods.find((p) => p.year === selected.year && p.month === selected.month);

  // ── 요약 조회 ─────────────────────────────────────────────────────────────
  const {
    data: report,
    isFetching: summaryFetching,
    error: summaryError,
  } = useQuery({
    queryKey: queryKeys.summary(selected?.year ?? 0, selected?.month ?? 0),
    queryFn: () => getSummary(selected!.year, selected!.month),
    enabled: !!selected,
    staleTime: 60_000,
  });

  // ── 다운로드 폴링 (useQuery + refetchInterval) ─────────────────────────────
  useQuery({
    queryKey: queryKeys.exportTask(dlTask?.taskId ?? ''),
    queryFn: () => getDbExportStatus(dlTask!.taskId),
    enabled: !!dlTask?.taskId && dlTask.phase !== 'done' && dlTask.phase !== 'error',
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'done' || s === 'error' ? false : 600;
    },
    retry: 4,
    retryDelay: 1200,
    staleTime: 0,
    select: (res) => {
      if (res.status === 'done') {
        setDlTask((t) => t ? { ...t, progress: 100, phase: 'done' } : null);
        getDbExportResult(dlTask!.taskId).then((blob) =>
          saveFileWithPicker(blob, dlTask!.filename),
        );
      } else if (res.status === 'error') {
        setDlTask((t) => t ? { ...t, phase: 'error', error: res.error ?? 'Excel 생성 실패' } : null);
      } else {
        setDlTask((t) => t ? { ...t, progress: res.progress ?? t.progress, phase: 'processing' } : null);
      }
      return res;
    },
  });

  // ── 다운로드 시작 ─────────────────────────────────────────────────────────
  async function handleDownload() {
    if (!selected || !report?.by_media.length || dlTask) return;
    try {
      const { task_id, filename } = await startDbExportTask(selected.year, selected.month);
      setDlTask({ taskId: task_id, filename, progress: 5, phase: 'pending' });
    } catch (err) {
      // 에러는 summaryError 처리 흐름과 일관성 있게 콘솔에만
      console.error(err);
    }
  }

  // ── 갱신 ─────────────────────────────────────────────────────────────────
  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: queryKeys.periods() });
    if (selected) {
      queryClient.invalidateQueries({ queryKey: queryKeys.summary(selected.year, selected.month) });
    }
  }

  const error = periodsError || summaryError;
  const errorMsg = error instanceof Error ? error.message : null;
  const isLoading = periodsLoading;
  const isFetching = summaryFetching;
  const canDownload = Boolean(selected && report?.by_media.length && !dlTask && !isNewPeriod);

  // ── 로딩 ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-2/30 p-10 flex items-center justify-center gap-3 text-slate-400 dark:text-fg-subtle">
        <span className="w-4 h-4 rounded-full border-2 border-slate-200 dark:border-border border-t-blue-500 animate-spin" />
        <span className="text-sm">저장된 기간 목록을 불러오는 중…</span>
      </div>
    );
  }

  if (!periods.length && !selected) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-2/30 p-10 flex flex-col items-center gap-3 text-center">
        <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-surface-2 flex items-center justify-center">
          <i className="bx bx-data text-2xl text-slate-300 dark:text-fg-subtle" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-fg-muted">아직 저장된 데이터가 없습니다</p>
          <p className="text-xs text-slate-400 dark:text-fg-subtle mt-1">
            아래 <strong className="font-medium text-slate-500 dark:text-fg-muted">데이터 업로드</strong>에서 CSV 또는 Excel을
            저장한 뒤 다시 확인하세요.
          </p>
        </div>
        <button
          onClick={onOpenUpload}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          업로드로 이동 <i className="bx bx-right-arrow-alt" />
        </button>
      </div>
    );
  }

  return (
    <>
      {dlTask && <DownloadProgressToast task={dlTask} onDismiss={() => setDlTask(null)} />}

      <div className="space-y-4">
        {/* 기간 선택 바 */}
        <div className="rounded-xl bg-slate-50/80 dark:bg-surface-2 border border-slate-200/60 dark:border-border px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500 dark:text-fg-muted">조회 기간</span>
            {isFetching && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" aria-label="불러오는 중" />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {periods.map((p) => {
                const label = `${p.year}년 ${p.month}월`;
                const active = selected?.year === p.year && selected?.month === p.month;
                return (
                  <button
                    key={label}
                    onClick={() => setSelected(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
                      ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-surface-3 text-slate-500 dark:text-fg-muted hover:bg-slate-200 dark:hover:bg-surface-3/70'}`}
                  >
                    {label}
                  </button>
                );
              })}
              {isNewPeriod && selected && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-blue-600 text-white whitespace-nowrap">
                  {selected.year}년 {selected.month}월
                  <span className="bg-white/20 text-[10px] px-1 py-0.5 rounded leading-none">NEW</span>
                </span>
              )}
            </div>

            <div ref={newPeriodRef} className="relative shrink-0">
              <button
                onClick={() => setNewPeriodOpen((v) => !v)}
                title="새 기간 추가"
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors border
                  ${newPeriodOpen ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-600' : 'border-slate-200 dark:border-border text-slate-500 dark:text-fg-muted hover:bg-slate-100 dark:hover:bg-surface-2'}`}
              >
                <i className="bx bx-plus" />
              </button>
              {newPeriodOpen && (
                <NewPeriodPopover
                  onSelect={(y, m) => setSelected({ year: y, month: m })}
                  onClose={() => setNewPeriodOpen(false)}
                />
              )}
            </div>

            <Button
              variant="ghost"
              className="border border-slate-200 dark:border-border shrink-0"
              onClick={handleDownload}
              disabled={!canDownload || isFetching}
              title={isNewPeriod ? 'DB에 저장 후 다운로드 가능합니다' : dlTask ? 'Excel 생성 중…' : 'Excel 다운로드'}
            >
              {dlTask
                ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                : <i className="bx bx-download text-lg" />}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 px-4 py-3">
            <i className="bx bx-error-circle text-red-500 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
          </div>
        )}

        {report && (
          <ReportView
            data={report}
            editable
            year={selected?.year}
            month={selected?.month}
            onRefresh={handleRefresh}
          />
        )}

        {!report && !isFetching && selected && (
          <div className="rounded-xl border border-dashed border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center text-sm text-amber-800/80 dark:text-amber-400/80">
            선택한 연·월에 표시할 데이터가 없습니다
          </div>
        )}
      </div>
    </>
  );
}
