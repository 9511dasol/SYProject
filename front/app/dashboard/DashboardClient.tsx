'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import UploadPanel from '@/components/marketing/UploadPanel';
import ReportDashboard, { type ImportedReport, type PendingLoad } from '@/components/marketing/ReportDashboard';
import Modal from '@/components/ui/Modal';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import BottomTaskBar, { type TaskProgress } from '@/components/ui/BottomTaskBar';
import { loadExcelReports, startSaveExcelTask, getSaveExcelTaskStatus, undoUpload } from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import {
  deletePersistedReport,
  loadActiveTab,
  loadPersistedReports,
  persistReport,
  saveActiveTab,
} from '@/lib/reportStorage';

// ── 저장 태스크 내부 상태 ──────────────────────────────────────────────────────

interface SaveTaskEntry {
  id: string;          // 로컬 UI ID
  label: string;
  remoteId: string | null;   // startSaveExcelTask 완료 후 채워짐
  startError?: string;       // startSaveExcelTask 실패 시
}

const CARD_BASE =
  'group relative flex gap-4 p-5 rounded-2xl border bg-linear-to-br bg-white dark:bg-surface ' +
  'dark:border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left';

// ── 섹션 헤더 ─────────────────────────────────────────────────────────────────

function SectionHeader({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 mb-5">
      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0 mt-0.5">
        {step}
      </span>
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-fg tracking-tight">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-fg-muted mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  // 홈 카드에 떨궈 모달을 연 경우, 그 파일을 모달의 첫 상태로 넘긴다
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [saveTaskEntries, setSaveTaskEntries] = useState<SaveTaskEntry[]>([]);
  const [importedReports, setImportedReports] = useState<ImportedReport[]>([]);
  const [pendingLoads, setPendingLoads] = useState<PendingLoad[]>([]);
  const [activeDashTab, setActiveDashTab] = useState<string>('db');

  // 완료된 remoteId는 한 번만 invalidate
  const invalidatedRef = useRef(new Set<string>());

  // IndexedDB에서 저장된 리포트 복원
  useEffect(() => {
    loadPersistedReports()
      .then((reports) => {
        if (reports.length > 0) {
          setImportedReports(reports);
          const savedTab = loadActiveTab();
          const validTab = reports.find((r) => r.id === savedTab) ? savedTab : 'db';
          setActiveDashTab(validTab);
        }
      })
      .catch(() => {});
  }, []);

  // ── 저장 태스크 폴링 (useQueries) ────────────────────────────────────────────
  // remoteId가 있는 항목만 폴링
  const pollEntries = saveTaskEntries.filter((t) => t.remoteId);

  const saveTaskQueries = useQueries({
    queries: pollEntries.map((entry) => ({
      queryKey: queryKeys.saveTask(entry.remoteId!),
      queryFn: () => getSaveExcelTaskStatus(entry.remoteId!),
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const s = query.state.data?.status;
        return s === 'done' || s === 'error' ? false : 600;
      },
      retry: 5,
      retryDelay: 1200,
      staleTime: 0,
    })),
  });

  // 완료 태스크 → periods 캐시 무효화 (한 번만)
  useEffect(() => {
    pollEntries.forEach((entry, idx) => {
      const data = saveTaskQueries[idx]?.data;
      if (data?.status === 'done' && entry.remoteId && !invalidatedRef.current.has(entry.remoteId)) {
        invalidatedRef.current.add(entry.remoteId);
        queryClient.invalidateQueries({ queryKey: queryKeys.periods() });
      }
    });
  });

  // BottomTaskBar용 TaskProgress 파생
  const saveTasks: TaskProgress[] = saveTaskEntries.map((entry) => {
    if (entry.startError) {
      return { id: entry.id, label: entry.label, status: 'error', message: entry.startError };
    }
    if (!entry.remoteId) {
      return { id: entry.id, label: entry.label, status: 'pending', progress: 0 };
    }
    const idx = pollEntries.findIndex((t) => t.id === entry.id);
    const q = saveTaskQueries[idx];
    const data = q?.data;
    if (!data) {
      return { id: entry.id, label: entry.label, status: 'processing', progress: 5 };
    }
    return {
      id: entry.id,
      label: entry.label,
      status: (data.status === 'done' || data.status === 'error') ? data.status : 'processing',
      progress: data.status === 'done' ? 100 : (data.progress ?? 0),
      message: data.message ?? data.error,
    };
  });

  // ── 토스트 ────────────────────────────────────────────────────────────────────

  const addToast = useCallback(
    (type: ToastItem['type'], message: string, action?: ToastItem['action']) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, message, action }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── 업로드 핸들러 ─────────────────────────────────────────────────────────────

  const handleUploadSuccess = useCallback(
    (message: string, undoId?: string) => {
      setUploadOpen(false);
      setDroppedFiles([]);
      // refreshTrigger 대신 직접 캐시 무효화.
      // summary 까지 같이 버려야 한다 — 60초 staleTime 이라, 보고 있던 달에 방금
      // 데이터를 올려도 표가 예전 값(전환수·구매매출이 0/'-')을 계속 보여줬다.
      queryClient.invalidateQueries({ queryKey: queryKeys.periods() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSummaries() });
      if (undoId) {
        addToast('success', message, {
          label: '되돌리기',
          onClick: () => {
            undoUpload(undoId)
              .then(() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.periods() });
                queryClient.invalidateQueries({ queryKey: queryKeys.allSummaries() });
                addToast('success', '되돌리기 완료');
              })
              .catch((err) =>
                addToast('error', err instanceof Error ? err.message : '되돌리기 실패'),
              );
          },
        });
      } else {
        addToast('success', message);
      }
    },
    [addToast, queryClient],
  );

  const handleUploadError = useCallback(
    (message: string) => addToast('error', message),
    [addToast],
  );

  // ── Excel 리포트 불러오기 ─────────────────────────────────────────────────────

  // 한 파일에 5월·6월처럼 여러 달이 들어 있으면 달마다 탭을 하나씩 만든다.
  const handleRequestLoad = useCallback(
    (file: File, fileName: string) => {
      const pendingId = `report-${Date.now()}`;
      const label = fileName.replace(/\.xlsx?$/i, '');

      setPendingLoads((prev) => [...prev, { id: pendingId, label }]);
      setUploadOpen(false);
      setDroppedFiles([]);

      loadExcelReports(file)
        .then((reports) => {
          if (reports.length === 0) {
            addToast('error', `"${label}"에서 읽을 수 있는 기간을 찾지 못했습니다.`);
            return;
          }
          const newReports: ImportedReport[] = reports.map((data, i) => ({
            id: `${pendingId}-${i}`,
            label: reports.length > 1 ? `${label} · ${data.period}` : label,
            period: data.period,
            data,
            file,
          }));
          setImportedReports((prev) => [...prev, ...newReports]);
          setActiveDashTab(newReports[0].id);
          saveActiveTab(newReports[0].id);
          newReports.forEach((r) => persistReport(r).catch(() => {}));
          addToast(
            'success',
            reports.length > 1
              ? `"${label}" — ${reports.map((r) => r.period).join(', ')} ${reports.length}개 기간을 불러왔습니다.`
              : `"${label}" 리포트를 불러왔습니다.`,
          );
        })
        .catch((err) => {
          addToast('error', `"${label}" 불러오기 실패: ${err instanceof Error ? err.message : '오류'}`);
        })
        .finally(() => {
          setPendingLoads((prev) => prev.filter((p) => p.id !== pendingId));
        });
    },
    [addToast],
  );

  const handleRemoveReport = useCallback((id: string) => {
    setImportedReports((prev) => prev.filter((r) => r.id !== id));
    setActiveDashTab((cur) => {
      const next = cur === id ? 'db' : cur;
      saveActiveTab(next);
      return next;
    });
    deletePersistedReport(id).catch(() => {});
  }, []);

  // ── DB 저장 (setInterval → useQueries 기반) ───────────────────────────────────

  const handleSaveImported = useCallback(
    async (id: string, replace: boolean) => {
      const report = importedReports.find((r) => r.id === id);
      if (!report) return;

      const localId = `save-${Date.now()}`;
      const label = `${report.data.period} DB 저장 중…`;

      setSaveTaskEntries((prev) => [...prev, { id: localId, label, remoteId: null }]);

      try {
        // period를 함께 보내 이 탭의 달만 저장/덮어쓰기한다 — 같은 파일의 다른 달은 건드리지 않는다.
        const { task_id } = await startSaveExcelTask(report.file, replace, [report.data.period]);
        setSaveTaskEntries((prev) =>
          prev.map((t) => (t.id === localId ? { ...t, remoteId: task_id } : t)),
        );
      } catch (err) {
        setSaveTaskEntries((prev) =>
          prev.map((t) =>
            t.id === localId
              ? { ...t, startError: err instanceof Error ? err.message : '저장 시작 실패' }
              : t,
          ),
        );
      }
    },
    [importedReports],
  );

  const handleTabChange = useCallback((id: string) => {
    setActiveDashTab(id);
    saveActiveTab(id);
  }, []);

  const openUpload = useCallback(() => {
    setDroppedFiles([]);
    setUploadOpen(true);
  }, []);

  const closeUpload = useCallback(() => {
    setUploadOpen(false);
    setDroppedFiles([]);
  }, []);

  // 카드에 떨군 파일로 모달을 연다. preventDefault 를 빠뜨리면 브라우저가 그 파일로
  // 페이지를 이동시켜 작업하던 화면이 통째로 날아간다.
  const handleCardDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    setDroppedFiles(files);
    setUploadOpen(true);
  }, []);

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <BottomTaskBar
        tasks={saveTasks}
        onRemove={(id) =>
          setSaveTaskEntries((prev) => prev.filter((t) => t.id !== id))
        }
      />

      {/* 업로드 모달 — 열 때마다 새로 마운트해 이전 선택이 남지 않게 한다 */}
      {uploadOpen && (
        <Modal open onClose={closeUpload} title="데이터 업로드" icon="bx-cloud-upload" size="lg">
          <UploadPanel
            initialFiles={droppedFiles}
            onSuccess={handleUploadSuccess}
            onError={handleUploadError}
            onRequestLoad={handleRequestLoad}
          />
        </Modal>
      )}

      {/* 배경 그라디언트 */}
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(37,99,235,0.10),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(248,250,252,0.8))]" />
      </div>

      {/* 페이지 콘텐츠 */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-12">
        {/* 히어로 · 퀵 액션 */}
        <section aria-label="시작하기">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">
            Marketing Data Pipeline
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-fg tracking-tight mb-2">
            무엇을 하시겠어요?
          </h2>
          <p className="text-sm text-slate-500 dark:text-fg-muted mb-6 max-w-xl leading-relaxed">
            이미 저장된 데이터가 있으면 리포트부터 확인하고, 새 파일이 있다면 업로드를 시작하세요.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <a
              href="#saved-report"
              className={`${CARD_BASE} from-blue-500/10 to-indigo-500/5 border-blue-200/80`}
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-600 text-white shadow-sm shrink-0">
                <i className="bx bx-bar-chart-alt-2 text-xl" />
              </span>
              <div className="min-w-0 pt-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-fg">
                  저장된 리포트 보기
                  <i className="bx bx-right-arrow-alt text-slate-400 dark:text-fg-subtle group-hover:translate-x-0.5 transition-transform" />
                </span>
                <p className="text-xs text-slate-500 dark:text-fg-muted mt-1.5 leading-relaxed">
                  DB에 저장된 연·월 데이터를 조회하고 Excel로 내려받습니다.
                </p>
              </div>
            </a>

            {/* 업로드 카드는 그 자체가 드롭존이다 — 파일을 여기 떨구면 모달이 파일 선택
                단계를 건너뛰고 바로 확인 단계로 열린다 (클릭 3번 → 1번). */}
            <button
              onClick={openUpload}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleCardDrop}
              className={`${CARD_BASE} ${
                dragOver
                  ? 'from-emerald-500/25 to-teal-500/10 border-emerald-500 ring-2 ring-emerald-500/40'
                  : 'from-emerald-500/10 to-teal-500/5 border-emerald-200/80'
              }`}
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-600 text-white shadow-sm shrink-0">
                <i className="bx bx-cloud-upload text-xl" />
              </span>
              <div className="min-w-0 pt-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-fg">
                  새 데이터 업로드
                  <i className="bx bx-right-arrow-alt text-slate-400 dark:text-fg-subtle group-hover:translate-x-0.5 transition-transform" />
                </span>
                <p className="text-xs text-slate-500 dark:text-fg-muted mt-1.5 leading-relaxed">
                  {dragOver
                    ? '여기에 놓으면 바로 확인 단계로 넘어갑니다'
                    : '매체·전환 CSV 또는 리포트 Excel을 끌어다 놓거나 클릭하세요.'}
                </p>
              </div>
            </button>
          </div>

          <ol className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-fg-muted">
            {(['연·월 선택 후 리포트 확인', 'CSV / Excel 업로드', 'DB 저장 후 대시보드 재조회'] as const).map(
              (step, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-surface-2 text-slate-600 dark:text-fg-muted flex items-center justify-center font-semibold text-[10px]">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ),
            )}
          </ol>
        </section>

        {/* 리포트 대시보드 */}
        <section id="saved-report" className="scroll-mt-20">
          <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white/90 dark:bg-surface shadow-sm shadow-slate-200/50 dark:shadow-black/20 p-5 sm:p-7">
            <SectionHeader
              step="01"
              title="리포트"
              description="DB에 저장된 리포트를 조회하거나, Excel 파일을 불러와 나란히 비교할 수 있습니다."
            />
            <ReportDashboard
              importedReports={importedReports}
              pendingLoads={pendingLoads}
              onRemoveReport={handleRemoveReport}
              onSaveReport={handleSaveImported}
              onOpenUpload={openUpload}
              activeTab={activeDashTab}
              onTabChange={handleTabChange}
            />
          </div>
        </section>
      </div>
    </>
  );
}
