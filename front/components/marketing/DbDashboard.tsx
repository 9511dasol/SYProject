'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelDbExportTask,
  getDbExportResult,
  getDbExportStatus,
  getPeriods,
  getSummary,
  saveFile,
  startDbExportTask,
} from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import PeriodPicker, { type Period } from '@/components/marketing/PeriodPicker';
import ReportView from '@/components/marketing/ReportView';
import Button from '@/components/ui/Button';
import { controlClassName } from '@/components/ui/Field';
import { useToast } from '@/components/providers/ToastProvider';

// Excel 다운로드 잠금 스위치.
// 원래 막아둔 이유는 출력 파일이 87MB까지 커져 브라우저 다운로드가 실패했기 때문인데,
// 리포트 템플릿을 최신 한 기간만 담은 버전으로 줄이면서 출력이 1MB 수준이 되어 다시 열었다.
// 문제가 생기면 이 값만 true 로 되돌리면 즉시 다시 막힌다.
// (boolean 으로 명시해 아래 코드가 '도달 불가'로 분석되지 않게 한다)
const DOWNLOAD_UNDER_MAINTENANCE: boolean = false;

type DlPhase = 'idle' | 'pending' | 'processing' | 'paused' | 'done' | 'error';

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

type ExportStatus = Awaited<ReturnType<typeof getDbExportStatus>>;

/**
 * 사용자 의도(dlTask)에 서버 진행 상태(exportStatus)를 렌더 중에 합쳐 표시용 값을 만든다.
 * 예전에는 이펙트 안에서 setDlTask로 같은 일을 했는데, 서버 응답 하나마다 렌더가
 * 한 번 더 도는 데다 두 상태가 어긋날 여지가 있었다.
 * 'paused'는 사용자가 폴링을 멈춘 상태라 서버 값으로 덮어쓰지 않는다.
 */
function mergeExportStatus(task: DownloadTask, status: ExportStatus | undefined): DownloadTask {
  if (task.phase === 'paused' || !status) return task;
  if (status.status === 'done') {
    return { ...task, progress: 100, phase: 'done' };
  }
  if (status.status === 'error') {
    // 백엔드가 'Excel 생성 실패'처럼 어느 단계에서 깨졌는지를 앞에 붙여 준다
    return { ...task, phase: 'error', error: status.error ?? '처리 중 오류가 발생했습니다.' };
  }
  return { ...task, progress: status.progress ?? task.progress, phase: 'processing' };
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

  return (
    <div className="absolute top-full mt-2 right-0 z-[var(--z-popover)] w-56 rounded-xl border border-border bg-surface shadow-overlay p-4 space-y-3">
      <p className="text-xs font-semibold text-fg-muted">새 기간 추가</p>
      {/*
        폭이 좁아 눈에 보이는 레이블을 넣으면 두 칸이 찌그러진다. 옵션 텍스트가
        "2026년" · "5월" 이라 시각적으로는 자명하므로 aria-label 로만 이름을 준다.
      */}
      <div className="flex gap-2">
        <select
          aria-label="연도"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className={`${controlClassName} flex-1 px-2 py-1.5 text-xs`}
        >
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select
          aria-label="월"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className={`${controlClassName} flex-1 px-2 py-1.5 text-xs`}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="flex-1">
          취소
        </Button>
        <Button size="sm" onClick={() => { onSelect(year, month); onClose(); }} className="flex-1">
          이동
        </Button>
      </div>
    </div>
  );
}

// ── 다운로드 진행률 토스트 ────────────────────────────────────────────────────

function DownloadProgressToast({
  task,
  fileReady,
  onSave,
  onDismiss,
  onPause,
  onResume,
  onCancel,
}: {
  task: DownloadTask;
  /** 파일을 서버에서 받아 메모리에 들고 있어 저장만 남은 상태 */
  fileReady: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const isDone = task.phase === 'done';
  const isError = task.phase === 'error';
  const isPaused = task.phase === 'paused';
  const isActive = !isDone && !isError && !isPaused;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-[var(--z-toast)] w-76 rounded-2xl shadow-xl shadow-black/10 border overflow-hidden transition-all
        ${isError ? 'bg-red-600 border-red-500 text-white'
          : isDone ? 'bg-emerald-600 border-emerald-500 text-white'
          : isPaused ? 'bg-slate-700 border-slate-600 text-white'
          : 'bg-slate-900 border-slate-700 text-white'}`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isActive && <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-blue-400 animate-spin shrink-0" />}
          {isPaused && <i className="bx bx-pause-circle text-xl shrink-0 text-slate-300" />}
          {isDone && <i className="bx bx-check-circle text-xl shrink-0" />}
          {isError && <i className="bx bx-error-circle text-xl shrink-0" />}
          <span className="text-sm font-semibold truncate">
            {isError ? 'Excel 생성 실패'
              : isDone ? (fileReady ? 'Excel 준비 완료 — 저장 위치를 선택하세요' : '파일 받아오는 중…')
              : isPaused ? '일시정지됨'
              : 'Excel 생성 중…'}
          </span>
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {(isActive || isPaused) && (
            <>
              {/* 일시정지 / 재개 */}
              {isActive ? (
                <button
                  onClick={onPause}
                  aria-label="일시정지"
                  title="일시정지"
                  className="w-6 h-6 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-white/10 transition-all"
                >
                  <i className="bx bx-pause text-base" />
                </button>
              ) : (
                <button
                  onClick={onResume}
                  aria-label="재개"
                  title="재개"
                  className="w-6 h-6 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-white/10 transition-all"
                >
                  <i className="bx bx-play text-base" />
                </button>
              )}
              {/* 취소 */}
              <button
                onClick={onCancel}
                aria-label="취소"
                title="다운로드 취소"
                className="w-6 h-6 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-red-500/40 transition-all"
              >
                <i className="bx bx-x text-lg" />
              </button>
            </>
          )}
          {(isDone || isError) && (
            <button onClick={onDismiss} aria-label="닫기" className="opacity-70 hover:opacity-100 transition-opacity">
              <i className="bx bx-x text-lg" />
            </button>
          )}
        </div>
      </div>

      {(isActive || isPaused) && (
        <div className="px-4 pb-1">
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isPaused ? 'bg-slate-400' : 'bg-blue-400'}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1 text-right tabular-nums">{task.progress}%</p>
        </div>
      )}

      {/* 실패 사유는 조치에 필요한 정보라 줄여 자르지 않는다 */}
      <div className={`px-4 pb-3 text-xs opacity-75 ${isError ? 'leading-relaxed' : 'truncate'}`}>
        {isError ? task.error : task.filename}
      </div>

      {/* 저장 버튼 — showSaveFilePicker는 사용자 제스처가 필요해서, 폴링 완료 시점에
          자동으로 부르면 대화상자 없이 기본 다운로드로 새어 나간다. 반드시 클릭으로 연다. */}
      {isDone && (
        <div className="px-4 pb-4">
          <button
            onClick={onSave}
            disabled={!fileReady}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/15 hover:bg-white/25
              disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2.5 text-sm font-semibold transition-colors"
          >
            <i className="bx bx-download text-base" />
            다운로드
          </button>
          <p className="text-[11px] opacity-70 mt-1.5 text-center">
            브라우저 다운로드로 저장됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export default function DbDashboard({ onOpenUpload }: DbDashboardProps = {}) {
  const queryClient = useQueryClient();
  // 사용자가 직접 고른 기간. null이면 목록의 첫 기간을 기본값으로 쓴다 (아래 selected 참고).
  const [pickedPeriod, setPickedPeriod] = useState<Period | null>(null);
  const [dlTask, setDlTask] = useState<DownloadTask | null>(null);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const newPeriodRef = useRef<HTMLDivElement>(null);
  const { toast: pushToast } = useToast();
  // 서버에서 받아 저장을 기다리는 파일 (사용자가 저장 위치를 고를 때까지 붙들고 있는다)
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);
  // 다운로드는 동기 호출이라 '저장 중' 상태가 없다. 같은 프레임 안의 중복 클릭만 ref로 막는다.
  const savingRef = useRef(false);
  // 완료된 export를 두 번 내려받지 않도록 (StrictMode의 이펙트 2회 실행 대비)
  const fetchedTaskRef = useRef<string | null>(null);

  // ── 기간 목록 ─────────────────────────────────────────────────────────────
  const {
    data: periods = [],
    isLoading: periodsLoading,
    error: periodsError,
  } = useQuery({
    queryKey: queryKeys.periods(),
    queryFn: getPeriods,
  });

  // 아직 아무것도 고르지 않았으면 목록의 첫 기간을 선택으로 삼는다.
  // (이펙트 + setState로 초기 선택을 넣으면 목록이 도착할 때마다 렌더가 한 번 더 돈다)
  const selected: Period | null = pickedPeriod ?? periods[0] ?? null;

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
  const { data: exportStatus } = useQuery({
    queryKey: queryKeys.exportTask(dlTask?.taskId ?? ''),
    queryFn: () => getDbExportStatus(dlTask!.taskId),
    // 완료/실패 시에는 refetchInterval이 false를 돌려주며 폴링이 멈춘다.
    enabled: !!dlTask?.taskId && dlTask.phase !== 'paused',
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'done' || s === 'error' ? false : 600;
    },
    retry: 4,
    retryDelay: 1200,
    staleTime: 0,
  });

  // 화면에 보여줄 실제 진행 상태 (사용자 의도 + 서버 응답)
  const dlView = dlTask ? mergeExportStatus(dlTask, exportStatus) : null;

  // 완료된 파일을 서버에서 받아 메모리에 들고만 있는다 — 실제 저장은 사용자가 토스트의
  // '다른 이름으로 저장'을 누를 때 한다. 여기서 바로 showSaveFilePicker를 부르면
  // 사용자 제스처가 없어 SecurityError로 튕기고 대화상자 없이 기본 다운로드가 돼 버린다.
  // 서버의 결과 파일은 1회용(내려주고 삭제)이라, 받아온 blob은 저장될 때까지 붙들고 있어야 한다.
  useEffect(() => {
    if (!dlView || dlView.phase !== 'done') return;
    if (fetchedTaskRef.current === dlView.taskId) return;

    fetchedTaskRef.current = dlView.taskId;
    getDbExportResult(dlView.taskId)
      .then((blob) => setReadyBlob(blob))
      .catch((err) => {
        // 받아오지 못하면 저장할 게 없다 — 토스트를 '받아오는 중'에 붙잡아 두지 않는다
        pushToast('error', err instanceof Error ? err.message : '파일 다운로드 실패');
        setDlTask(null);
      });
  // dlView는 매 렌더마다 새 객체라 원시값만 의존한다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlView?.taskId, dlView?.phase]);

  // 팝오버 바깥을 누르면 닫는다
  useEffect(() => {
    if (!newPeriodOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!newPeriodRef.current?.contains(e.target as Node)) setNewPeriodOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [newPeriodOpen]);

  // ── 저장 (사용자 클릭) ────────────────────────────────────────────────────
  function handleSaveFile() {
    // 상태 가드는 setState가 즉시 반영되지 않아 같은 프레임의 두 번째 클릭을 통과시킨다 — ref로 막는다.
    if (!readyBlob || !dlTask || savingRef.current) return;
    savingRef.current = true;
    try {
      saveFile(readyBlob, dlTask.filename);
      pushToast('success', '다운로드를 시작했습니다.');
      closeDownloadToast();
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '파일 저장 실패');
    } finally {
      savingRef.current = false;
    }
  }

  function closeDownloadToast() {
    setReadyBlob(null);
    setDlTask(null);
  }

  function handleDismissDownload() {
    // 결과 파일은 이미 서버에서 지워졌다 — 저장 안 하고 닫으면 다시 만들어야 한다
    if (readyBlob) {
      pushToast('info', '저장하지 않고 닫았습니다. 필요하면 다운로드를 다시 실행해 주세요.');
    }
    closeDownloadToast();
  }

  // ── 다운로드 시작 ─────────────────────────────────────────────────────────
  async function handleDownload() {
    if (DOWNLOAD_UNDER_MAINTENANCE) {
      pushToast('info', '다운로드 기능은 현재 서비스 준비중입니다.');
      return;
    }
    if (!selected || !report?.by_media.length || dlTask) return;
    try {
      const task = await startDbExportTask(selected.year, selected.month);
      setDlTask({
        taskId: task.task_id,
        filename: task.filename,
        progress: 5,
        phase: 'pending',
      });
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '요청에 실패했습니다.');
    }
  }

  function handlePauseDownload() {
    // 폴링이 멈추면 서버 진행률이 더는 안 오므로, 지금까지 확인된 진행률을 고정해 둔다.
    setDlTask((t) => (t ? { ...mergeExportStatus(t, exportStatus), phase: 'paused' } : null));
  }

  function handleResumeDownload() {
    setDlTask((t) => t ? { ...t, phase: 'processing' } : null);
  }

  async function handleCancelDownload() {
    if (!dlTask) return;
    await cancelDbExportTask(dlTask.taskId);
    closeDownloadToast();
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
      <div className="rounded-xl border border-dashed border-border bg-surface-2/50 p-10 flex items-center justify-center gap-3 text-fg-subtle">
        <span className="w-4 h-4 rounded-full border-2 border-border border-t-blue-500 animate-spin" />
        <span className="text-sm">저장된 기간 목록을 불러오는 중…</span>
      </div>
    );
  }

  if (!periods.length && !selected) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2/50 p-10 flex flex-col items-center gap-3 text-center">
        <span className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
          <i className="bx bx-data text-2xl text-fg-disabled" />
        </span>
        <div>
          <p className="text-sm font-medium text-fg-muted">아직 저장된 데이터가 없습니다</p>
          <p className="text-xs text-fg-subtle mt-1">
            아래 <strong className="font-medium text-fg-muted">데이터 업로드</strong>에서 CSV 또는 Excel을
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
      {dlView && (
        <DownloadProgressToast
          task={dlView}
          fileReady={readyBlob !== null}
          onSave={handleSaveFile}
          onDismiss={handleDismissDownload}
          onPause={handlePauseDownload}
          onResume={handleResumeDownload}
          onCancel={handleCancelDownload}
        />
      )}

      <div className="space-y-4">
        {/* 기간 선택 바 */}
        <div className="rounded-xl bg-surface-2 border border-border px-4 py-3 sm:px-5 sm:py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-fg-muted shrink-0">조회 기간</span>
              {selected && (
                <span className="text-sm font-semibold text-fg tabular-nums truncate">
                  {selected.year}년 {selected.month}월
                </span>
              )}
              {isFetching && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-primary animate-spin shrink-0" aria-label="불러오는 중" />
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div ref={newPeriodRef} className="relative">
                <button
                  onClick={() => setNewPeriodOpen((v) => !v)}
                  title="목록에 없는 기간으로 이동"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors border
                    ${newPeriodOpen ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-600' : 'border-border text-fg-muted hover:bg-surface-3'}`}
                >
                  <i className="bx bx-plus" />
                </button>
                {newPeriodOpen && (
                  <NewPeriodPopover
                    onSelect={(y, m) => setPickedPeriod({ year: y, month: m })}
                    onClose={() => setNewPeriodOpen(false)}
                  />
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={(!canDownload && !DOWNLOAD_UNDER_MAINTENANCE) || isFetching}
                title={
                  DOWNLOAD_UNDER_MAINTENANCE ? '서비스 준비중입니다'
                    : isNewPeriod ? 'DB에 저장 후 다운로드 가능합니다'
                    : dlTask ? 'Excel 생성 중…'
                    : 'Excel 다운로드'
                }
              >
                {dlTask
                  ? <span className="w-4 h-4 rounded-full border-2 border-border border-t-fg-subtle animate-spin" />
                  : <i className="bx bx-download text-lg" />}
                <span className="hidden sm:inline text-xs">다운로드</span>
              </Button>
            </div>
          </div>

          <PeriodPicker periods={periods} selected={selected} onSelect={setPickedPeriod} />
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
