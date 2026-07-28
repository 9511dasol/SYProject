'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  canPickSaveLocation,
  cancelDbExportTask,
  getDbExportResult,
  getDbExportStatus,
  getPeriods,
  getSummary,
  saveFileWithPicker,
  startDbExportTask,
} from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import ReportView from '@/components/marketing/ReportView';
import Button from '@/components/ui/Button';
import EmailRecipientInput, { isValidEmail } from '@/components/ui/EmailRecipientInput';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';

// Excel 다운로드/이메일 발송 기능 잠금 스위치.
// 원래 막아둔 이유는 출력 파일이 87MB까지 커져 브라우저 다운로드가 실패했기 때문인데,
// 리포트 템플릿을 최신 한 기간만 담은 버전으로 줄이면서 출력이 1MB 수준이 되어 다시 열었다.
// 문제가 생기면 이 값만 true 로 되돌리면 즉시 다시 막힌다.
// (boolean 으로 명시해 아래 코드가 '도달 불가'로 분석되지 않게 한다)
const DOWNLOAD_UNDER_MAINTENANCE: boolean = false;

type Period = { year: number; month: number };
type DlPhase = 'idle' | 'pending' | 'processing' | 'paused' | 'done' | 'error';

interface DownloadTask {
  taskId: string;
  filename: string;
  progress: number;
  phase: DlPhase;
  error?: string;
  deliverBy: 'download' | 'email';
  /** 이메일 발송일 때 받는 사람 */
  recipients?: string[];
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
    return {
      ...task,
      progress: 100,
      phase: 'done',
      recipients: status.recipients?.length ? status.recipients : task.recipients,
    };
  }
  if (status.status === 'error') {
    // 백엔드가 'Excel 생성 실패 / 메일 발송 실패'처럼 단계를 앞에 붙여 준다
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

// ── 받는 사람 지정 팝오버 ──────────────────────────────────────────────────────

const MAX_RECIPIENTS = 10; // 백엔드 _MAX_RECIPIENTS 와 맞춰 둔다

function RecipientPopover({
  defaultEmail,
  onSend,
  onClose,
}: {
  defaultEmail: string;
  onSend: (recipients: string[]) => void;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<string[]>(
    defaultEmail && isValidEmail(defaultEmail) ? [defaultEmail] : [],
  );
  const [draft, setDraft] = useState('');

  // 로그인 계정의 도메인은 동료 주소일 확률이 높아 추천 목록 맨 앞에 둔다
  const ownDomain = defaultEmail.split('@')[1];
  const extraDomains = ownDomain ? [ownDomain] : undefined;

  // 아직 칩으로 확정하지 않고 입력창에 남아 있는 주소도 함께 보낸다
  const pending = draft.trim();
  const all = pending && isValidEmail(pending) && !recipients.includes(pending)
    ? [...recipients, pending]
    : recipients;
  const draftInvalid = pending.length > 0 && !isValidEmail(pending);
  const canSend = all.length > 0 && all.length <= MAX_RECIPIENTS && !draftInvalid;

  return (
    <div className="absolute top-full mt-2 right-0 z-20 w-80 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-surface shadow-xl p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-fg-muted">이메일로 받기</p>
        <p className="text-[11px] text-slate-400 dark:text-fg-subtle mt-0.5">
          입력 후 Enter로 추가 · 최대 {MAX_RECIPIENTS}명
        </p>
      </div>

      <EmailRecipientInput
        value={recipients}
        onChange={setRecipients}
        draft={draft}
        onDraftChange={setDraft}
        extraDomains={extraDomains}
        max={MAX_RECIPIENTS}
        autoFocus
      />

      {draftInvalid && (
        <p className="text-[11px] text-red-500">형식이 올바르지 않습니다: {pending}</p>
      )}
      {!draftInvalid && all.length > 1 && (
        <p className="text-[11px] text-slate-400 dark:text-fg-subtle">{all.length}명에게 발송</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-fg-muted hover:bg-slate-100 dark:hover:bg-surface-2 transition-colors"
        >
          취소
        </button>
        <button
          onClick={() => { onSend(all); onClose(); }}
          disabled={!canSend}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          보내기
        </button>
      </div>
    </div>
  );
}

// ── 다운로드 진행률 토스트 ────────────────────────────────────────────────────

function DownloadProgressToast({
  task,
  fileReady,
  isSaving,
  onSave,
  onDismiss,
  onPause,
  onResume,
  onCancel,
}: {
  task: DownloadTask;
  /** 파일을 서버에서 받아 메모리에 들고 있어 저장만 남은 상태 */
  fileReady: boolean;
  isSaving: boolean;
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
  // 저장 단계 — 다운로드 방식이면서 생성이 끝난 경우에만 노출
  const isSaveStep = isDone && task.deliverBy === 'download';
  const pickerSupported = canPickSaveLocation();

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-200 w-76 rounded-2xl shadow-xl shadow-black/10 border overflow-hidden transition-all
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
            {isError ? (task.deliverBy === 'email' ? '이메일 발송 실패' : 'Excel 생성 실패')
              : isSaveStep ? (fileReady ? 'Excel 준비 완료 — 저장 위치를 선택하세요' : '파일 받아오는 중…')
              : isDone ? '이메일로 발송 완료'
              : isPaused ? '일시정지됨'
              : task.deliverBy === 'email' ? 'Excel 생성 후 메일 발송 중…' : 'Excel 생성 중…'}
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
        {isError
          ? task.error
          : isDone && task.deliverBy === 'email' && task.recipients?.length
            ? `${task.recipients.join(', ')} 으로 발송`
            : task.filename}
      </div>

      {/* 저장 버튼 — showSaveFilePicker는 사용자 제스처가 필요해서, 폴링 완료 시점에
          자동으로 부르면 대화상자 없이 기본 다운로드로 새어 나간다. 반드시 클릭으로 연다. */}
      {isSaveStep && (
        <div className="px-4 pb-4">
          <button
            onClick={onSave}
            disabled={!fileReady || isSaving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/15 hover:bg-white/25
              disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2.5 text-sm font-semibold transition-colors"
          >
            {isSaving ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <i className={`bx ${pickerSupported ? 'bx-save' : 'bx-download'} text-base`} />
            )}
            {isSaving ? '저장 중…' : pickerSupported ? '다른 이름으로 저장' : '다운로드'}
          </button>
          <p className="text-[11px] opacity-70 mt-1.5 text-center">
            {pickerSupported
              ? '저장할 폴더와 파일 이름을 직접 고를 수 있습니다.'
              : '이 브라우저는 저장 위치 선택을 지원하지 않아 다운로드 폴더에 저장됩니다.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export default function DbDashboard({ onOpenUpload }: DbDashboardProps = {}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  // 사용자가 직접 고른 기간. null이면 목록의 첫 기간을 기본값으로 쓴다 (아래 selected 참고).
  const [pickedPeriod, setPickedPeriod] = useState<Period | null>(null);
  const [dlTask, setDlTask] = useState<DownloadTask | null>(null);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const newPeriodRef = useRef<HTMLDivElement>(null);
  // 이메일 받는 사람 지정 팝오버
  const [recipientOpen, setRecipientOpen] = useState(false);
  const recipientRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // 서버에서 받아 저장을 기다리는 파일 (사용자가 저장 위치를 고를 때까지 붙들고 있는다)
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // 버튼 비활성화(isSaving)는 리렌더 뒤에야 걸린다 — 빠른 더블클릭 방어는 ref로 한다
  const savingRef = useRef(false);
  // 완료된 export를 두 번 내려받지 않도록 (StrictMode의 이펙트 2회 실행 대비)
  const fetchedTaskRef = useRef<string | null>(null);

  function pushToast(type: ToastItem['type'], message: string) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }

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
  // 이메일 전송 건은 백엔드가 이미 발송했으므로 여기서 받을 파일이 없다.
  useEffect(() => {
    if (!dlView || dlView.phase !== 'done' || dlView.deliverBy !== 'download') return;
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
  }, [dlView?.taskId, dlView?.phase, dlView?.deliverBy]);

  // 팝오버 바깥을 누르면 닫는다
  useEffect(() => {
    if (!newPeriodOpen && !recipientOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!newPeriodRef.current?.contains(target)) setNewPeriodOpen(false);
      if (!recipientRef.current?.contains(target)) setRecipientOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [newPeriodOpen, recipientOpen]);

  // ── 저장 (사용자 클릭) ────────────────────────────────────────────────────
  async function handleSaveFile() {
    // isSaving(상태)만으로는 같은 프레임 안의 두 번째 클릭을 막지 못한다 —
    // setIsSaving은 즉시 반영되지 않아 두 번 다 가드를 통과하고 저장 대화상자가 두 번 뜬다.
    if (!readyBlob || !dlTask || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const result = await saveFileWithPicker(readyBlob, dlTask.filename);
      if (result === 'cancelled') return; // 토스트를 남겨 다시 저장할 수 있게 한다
      pushToast(
        'success',
        result === 'saved' ? '선택한 위치에 저장했습니다.' : '다운로드 폴더에 저장했습니다.',
      );
      closeDownloadToast();
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '파일 저장 실패');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
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
  async function handleDownload(
    deliverBy: 'download' | 'email' = 'download',
    recipients?: string[],
  ) {
    if (DOWNLOAD_UNDER_MAINTENANCE) {
      const what = deliverBy === 'email' ? '이메일 발송' : '다운로드';
      pushToast('info', `${what} 기능은 현재 서비스 준비중입니다.`);
      return;
    }
    if (!selected || !report?.by_media.length || dlTask) return;
    try {
      const task = await startDbExportTask(selected.year, selected.month, deliverBy, recipients);
      setDlTask({
        taskId: task.task_id,
        filename: task.filename,
        progress: 5,
        phase: 'pending',
        deliverBy,
        recipients: task.recipients,
      });
    } catch (err) {
      // 메일 설정 누락 같은 400은 여기서 즉시 돌아온다 — 사용자에게 그대로 보여준다
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
      <ToastContainer
        toasts={toasts}
        onRemove={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {dlView && (
        <DownloadProgressToast
          task={dlView}
          fileReady={readyBlob !== null}
          isSaving={isSaving}
          onSave={handleSaveFile}
          onDismiss={handleDismissDownload}
          onPause={handlePauseDownload}
          onResume={handleResumeDownload}
          onCancel={handleCancelDownload}
        />
      )}

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
                    onClick={() => setPickedPeriod(p)}
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
                  onSelect={(y, m) => setPickedPeriod({ year: y, month: m })}
                  onClose={() => setNewPeriodOpen(false)}
                />
              )}
            </div>

            <Button
              variant="ghost"
              className="border border-slate-200 dark:border-border shrink-0"
              onClick={() => handleDownload('download')}
              disabled={(!canDownload && !DOWNLOAD_UNDER_MAINTENANCE) || isFetching}
              title={
                DOWNLOAD_UNDER_MAINTENANCE ? '서비스 준비중입니다'
                  : isNewPeriod ? 'DB에 저장 후 다운로드 가능합니다'
                  : dlTask ? 'Excel 생성 중…'
                  : 'Excel 다운로드'
              }
            >
              {dlTask && dlTask.deliverBy === 'download'
                ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                : <i className="bx bx-download text-lg" />}
            </Button>

            <div className="relative shrink-0" ref={recipientRef}>
              <Button
                variant="ghost"
                className="border border-slate-200 dark:border-border"
                onClick={() => setRecipientOpen((v) => !v)}
                disabled={(!canDownload && !DOWNLOAD_UNDER_MAINTENANCE) || isFetching}
                title={
                  DOWNLOAD_UNDER_MAINTENANCE ? '서비스 준비중입니다'
                    : isNewPeriod ? 'DB에 저장 후 이용 가능합니다'
                    : dlTask ? '처리 중…'
                    : '이메일로 받기 — 받는 사람을 지정할 수 있습니다'
                }
              >
                {dlTask && dlTask.deliverBy === 'email'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                  : <i className="bx bx-envelope text-lg" />}
              </Button>

              {recipientOpen && (
                <RecipientPopover
                  defaultEmail={session?.user?.email ?? ''}
                  onSend={(recipients) => handleDownload('email', recipients)}
                  onClose={() => setRecipientOpen(false)}
                />
              )}
            </div>
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
