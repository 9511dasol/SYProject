'use client';

import { useEffect, useState } from 'react';
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
  progress: number; // 0-100
  phase: DlPhase;
  error?: string;
}

interface DbDashboardProps {
  refreshTrigger?: number;
  onOpenUpload?: () => void;
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
      className={`fixed bottom-5 right-5 z-[200] w-72 rounded-2xl shadow-xl shadow-black/10 border overflow-hidden transition-all
        ${isError
          ? 'bg-red-600 border-red-500 text-white'
          : isDone
            ? 'bg-emerald-600 border-emerald-500 text-white'
            : 'bg-slate-900 border-slate-700 text-white'
        }`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isActive && (
            <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-blue-400 animate-spin shrink-0" />
          )}
          {isDone && <i className="bx bx-check-circle text-xl shrink-0" />}
          {isError && <i className="bx bx-error-circle text-xl shrink-0" />}
          <span className="text-sm font-semibold truncate">
            {isError
              ? 'Excel 생성 실패'
              : isDone
                ? 'Excel 준비 완료'
                : 'Excel 생성 중…'}
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

      {/* 진행률 바 */}
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

      {/* 파일명 or 오류 메시지 */}
      <div className="px-4 pb-3 text-xs opacity-75 truncate">
        {isError ? task.error : task.filename}
      </div>
    </div>
  );
}

export default function DbDashboard({ refreshTrigger = 0, onOpenUpload }: DbDashboardProps = {}) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selected, setSelected] = useState<Period | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [syncedPeriod, setSyncedPeriod] = useState<Period | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlTask, setDlTask] = useState<DownloadTask | null>(null);

  const isFetching = Boolean(
    selected &&
      (syncedPeriod?.year !== selected.year || syncedPeriod?.month !== selected.month),
  );

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
            return keep ? { ...keep } : { ...list[0] };
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
  }, [refreshTrigger]);

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
            // 3초 후 토스트 자동 제거
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
  }, [dlTask?.taskId]); // taskId가 바뀔 때만 재실행

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

  // ── 로딩 ────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 flex items-center justify-center gap-3 text-slate-400">
        <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
        <span className="text-sm">저장된 기간 목록을 불러오는 중…</span>
      </div>
    );
  }

  if (!periods.length) {
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

  const canDownload = Boolean(selected && report?.by_media.length && !dlTask);

  return (
    <>
      {/* 다운로드 진행률 토스트 */}
      {dlTask && (
        <DownloadProgressToast task={dlTask} onDismiss={() => setDlTask(null)} />
      )}

      <div className="space-y-4">
        {/* 기간 선택 + 다운로드 버튼 */}
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
            <div className="flex gap-1.5 overflow-x-auto">
              {periods.map((p) => {
                const label = `${p.year}년 ${p.month}월`;
                const active = selected?.year === p.year && selected?.month === p.month;
                return (
                  <button
                    key={label}
                    onClick={() => {
                      setError(null);
                      setSelected(p);
                    }}
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
            </div>
            <Button
              variant="ghost"
              className="border border-slate-200 shrink-0"
              onClick={handleDownload}
              disabled={!canDownload || isFetching}
              title={dlTask ? 'Excel 생성 중…' : 'Excel 다운로드'}
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

        {report && report.by_media.length > 0 && <ReportView data={report} />}

        {report && report.by_media.length === 0 && !isFetching && (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-6 text-center text-sm text-amber-800/80">
            선택한 연·월에 표시할 데이터가 없습니다
          </div>
        )}
      </div>
    </>
  );
}
