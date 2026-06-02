'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getDbExportResult,
  getDbExportStatus,
  getPeriods,
  getSummary,
  saveFileWithPicker,
  startDbExportTask,
} from '@/lib/marketingClient';
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
  refreshTrigger?: number;
  onOpenUpload?: () => void;
}

// ── 새 기간 선택 팝오버 ────────────────────────────────────────────────────────
interface NewPeriodPopoverProps {
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}

function NewPeriodPopover({ onSelect, onClose }: NewPeriodPopoverProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const selectClass =
    'flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="absolute top-full mt-2 right-0 z-20 w-56 rounded-xl border border-slate-200 bg-white shadow-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-600">새 기간 추가</p>

      <div className="flex gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
          {years.map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
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
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
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
function DownloadProgressToast({
  task,
  onDismiss,
}: {
  task: DownloadTask;
  onDismiss: () => void;
}) {
  const isDone = task.phase === 'done';
  const isError = task.phase === 'error';
  const isActive = !isDone && !isError;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-200 w-72 rounded-2xl shadow-xl shadow-black/10 border overflow-hidden transition-all
        ${isError
          ? 'bg-red-600 border-red-500 text-white'
          : isDone
            ? 'bg-emerald-600 border-emerald-500 text-white'
            : 'bg-slate-900 border-slate-700 text-white'
        }`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isActive && (
            <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-blue-400 animate-spin shrink-0" />
          )}
          {isDone && <i className="bx bx-check-circle text-xl shrink-0" />}
          {isError && <i className="bx bx-error-circle text-xl shrink-0" />}
          <span className="text-sm font-semibold truncate">
            {isError ? 'Excel 생성 실패' : isDone ? 'Excel 준비 완료' : 'Excel 생성 중…'}
          </span>
        </div>
        {(isDone || isError) && (
          <button
            onClick={onDismiss}
            aria-label="닫기"
            className="opacity-70 hover:opacity-100 transition-opacity shrink-0 ml-2"
          >
            <i className="bx bx-x text-lg" />
          </button>
        )}
      </div>

      {isActive && (
        <div className="px-4 pb-1">
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${task.progress}%` }}
            />
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
export default function DbDashboard({ refreshTrigger = 0, onOpenUpload }: DbDashboardProps = {}) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selected, setSelected] = useState<Period | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [syncedPeriod, setSyncedPeriod] = useState<Period | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlTask, setDlTask] = useState<DownloadTask | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const newPeriodRef = useRef<HTMLDivElement>(null);

  const isFetching = Boolean(
    selected &&
      (syncedPeriod?.year !== selected.year || syncedPeriod?.month !== selected.month),
  );

  // 선택된 기간이 DB 기간 목록에 없는 새 기간인지 여부
  const isNewPeriod =
    selected !== null &&
    !periods.find((p) => p.year === selected.year && p.month === selected.month);

  // ── 팝오버 외부 클릭 닫기 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!newPeriodOpen) return;
    function handleClick(e: MouseEvent) {
      if (newPeriodRef.current && !newPeriodRef.current.contains(e.target as Node)) {
        setNewPeriodOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [newPeriodOpen]);

  // ── 기간 목록 조회 ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    getPeriods()
      .then((list) => {
        if (!active) return;
        setPeriods(list);
        if (list.length > 0) {
          setSelected((prev) => {
            const keep = list.find(
              (p) => p.year === prev?.year && p.month === prev?.month,
            );
            // 현재 선택이 새 기간이면 유지, 없으면 목록 첫 번째로
            return keep ? { ...keep } : prev ?? { ...list[0] };
          });
        } else {
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : '기간 조회 실패');
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [refreshTrigger, localRefresh]);

  // ── 요약 조회 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    let active = true;
    getSummary(selected.year, selected.month)
      .then((data) => {
        if (active) {
          setError(null);
          setReport(data);
          setSyncedPeriod(selected);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : '조회 실패');
          setReport(null);
          setSyncedPeriod(selected);
          setIsLoading(false);
        }
      });
    return () => { active = false; };
  }, [selected]);

  // ── 다운로드 폴링 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dlTask?.taskId || dlTask.phase === 'done' || dlTask.phase === 'error') return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await getDbExportStatus(dlTask!.taskId);
        if (!active) return;

        if (res.status === 'done') {
          setDlTask((t) => t ? { ...t, progress: 100, phase: 'done' } : null);
          const blob = await getDbExportResult(dlTask!.taskId);
          if (active) {
            await saveFileWithPicker(blob, dlTask!.filename);
            timer = setTimeout(() => {
              if (active) setDlTask(null);
            }, 3000);
          }
        } else if (res.status === 'error') {
          setDlTask((t) => t ? { ...t, phase: 'error', error: res.error ?? 'Excel 생성 실패' } : null);
        } else {
          setDlTask((t) => t ? { ...t, progress: res.progress, phase: 'processing' } : null);
          timer = setTimeout(poll, 600);
        }
      } catch {
        if (active) timer = setTimeout(poll, 1200);
      }
    }

    timer = setTimeout(poll, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dlTask?.taskId]);

  // ── 다운로드 시작 ────────────────────────────────────────────────────────────
  async function handleDownload() {
    if (!selected || !report?.by_media.length || dlTask) return;
    setError(null);
    try {
      const { task_id, filename } = await startDbExportTask(selected.year, selected.month);
      setDlTask({ taskId: task_id, filename, progress: 5, phase: 'pending' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel 변환 시작 실패');
    }
  }

  // ── 새 기간 선택 ─────────────────────────────────────────────────────────────
  function handleSelectNewPeriod(year: number, month: number) {
    setError(null);
    setSelected({ year, month });
  }

  // ── onRefresh: 요약 + 기간 목록 동시 갱신 ───────────────────────────────────
  function handleRefresh() {
    setLocalRefresh((n) => n + 1);           // 기간 목록 재조회
    setSelected((prev) => (prev ? { ...prev } : null)); // 요약 재조회
  }

  // ── 로딩 ────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 flex items-center justify-center gap-3 text-slate-400">
        <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
        <span className="text-sm">저장된 기간 목록을 불러오는 중…</span>
      </div>
    );
  }

  if (!periods.length && !selected) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 flex flex-col items-center gap-3 text-center">
        <span className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          <i className="bx bx-data text-2xl text-slate-300" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-600">아직 저장된 데이터가 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">
            아래 <strong className="font-medium text-slate-500">데이터 업로드</strong>에서 CSV 또는 Excel을
            저장한 뒤 다시 확인하세요.
          </p>
        </div>
        <button
          onClick={onOpenUpload}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          업로드로 이동
          <i className="bx bx-right-arrow-alt" />
        </button>
      </div>
    );
  }

  const canDownload = Boolean(selected && report?.by_media.length && !dlTask && !isNewPeriod);

  return (
    <>
      {dlTask && (
        <DownloadProgressToast task={dlTask} onDismiss={() => setDlTask(null)} />
      )}

      <div className="space-y-4">
        {/* 기간 선택 바 */}
        <div className="rounded-xl bg-slate-50/80 border border-slate-200/60 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500">조회 기간</span>
            {isFetching && (
              <span
                className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin"
                aria-label="불러오는 중"
              />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {/* 기존 DB 기간 */}
              {periods.map((p) => {
                const label = `${p.year}년 ${p.month}월`;
                const active = selected?.year === p.year && selected?.month === p.month;
                return (
                  <button
                    key={label}
                    onClick={() => { setError(null); setSelected(p); }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              {/* 새 기간 (DB에 없는 선택 기간) */}
              {isNewPeriod && selected && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-blue-600 text-white whitespace-nowrap">
                  {selected.year}년 {selected.month}월
                  <span className="bg-white/20 text-[10px] px-1 py-0.5 rounded leading-none">NEW</span>
                </span>
              )}
            </div>

            {/* 새 기간 추가 버튼 */}
            <div ref={newPeriodRef} className="relative shrink-0">
              <button
                onClick={() => setNewPeriodOpen((v) => !v)}
                title="새 기간 추가"
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors border ${
                  newPeriodOpen
                    ? 'bg-blue-50 border-blue-300 text-blue-600'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <i className="bx bx-plus" />
              </button>
              {newPeriodOpen && (
                <NewPeriodPopover
                  onSelect={handleSelectNewPeriod}
                  onClose={() => setNewPeriodOpen(false)}
                />
              )}
            </div>

            {/* Excel 다운로드 */}
            <Button
              variant="ghost"
              className="border border-slate-200 shrink-0"
              onClick={handleDownload}
              disabled={!canDownload || isFetching}
              title={
                isNewPeriod
                  ? 'DB에 저장 후 다운로드 가능합니다'
                  : dlTask
                    ? 'Excel 생성 중…'
                    : 'Excel 다운로드'
              }
            >
              {dlTask ? (
                <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
              ) : (
                <i className="bx bx-download text-lg" />
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
            <i className="bx bx-error-circle text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {report && (
          <ReportView
            data={report}
            editable={true}
            year={selected?.year}
            month={selected?.month}
            onRefresh={handleRefresh}
          />
        )}

        {!report && !isFetching && selected && (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-6 text-center text-sm text-amber-800/80">
            선택한 연·월에 표시할 데이터가 없습니다
          </div>
        )}
      </div>
    </>
  );
}
