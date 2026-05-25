'use client';

import { useCallback, useEffect, useState } from 'react';
import MainTabs from '@/components/marketing/MainTabs';
import ReportDashboard, { type ImportedReport, type PendingLoad } from '@/components/marketing/ReportDashboard';
import Modal from '@/components/ui/Modal';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import BottomTaskBar, { type TaskProgress } from '@/components/ui/BottomTaskBar';
import { loadExcelReport, startSaveExcelTask, getSaveExcelTaskStatus, undoUpload } from '@/lib/marketingClient';
import {
  deletePersistedReport,
  loadActiveTab,
  loadPersistedReports,
  persistReport,
  saveActiveTab,
} from '@/lib/reportStorage';

const QUICK_ACTIONS = [
  {
    id: 'report',
    href: '#saved-report',
    icon: 'bx-bar-chart-alt-2',
    title: '저장된 리포트 보기',
    description: 'DB에 저장된 연·월 데이터를 조회하고 Excel로 내려받습니다.',
    accent: 'from-blue-500/10 to-indigo-500/5 border-blue-200/80',
    iconBg: 'bg-blue-600',
  },
  {
    id: 'upload',
    href: undefined,
    icon: 'bx-cloud-upload',
    title: '새 데이터 업로드',
    description: 'CSV 분석·저장 또는 Excel 불러오기·DB 저장을 진행합니다.',
    accent: 'from-emerald-500/10 to-teal-500/5 border-emerald-200/80',
    iconBg: 'bg-emerald-600',
  },
] as const;

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
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function HomeClient() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [saveTasks, setSaveTasks] = useState<TaskProgress[]>([]);
  const [importedReports, setImportedReports] = useState<ImportedReport[]>([]);
  const [pendingLoads, setPendingLoads] = useState<PendingLoad[]>([]);
  const [activeDashTab, setActiveDashTab] = useState<string>('db');

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
      .catch(() => {/* IndexedDB 미지원 환경 무시 */});
  }, []);

  const addToast = useCallback((type: ToastItem['type'], message: string, action?: ToastItem['action']) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, action }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleUploadSuccess = useCallback(
    (message: string, undoId?: string) => {
      setUploadOpen(false);
      setRefreshTrigger((n) => n + 1);
      if (undoId) {
        addToast('success', message, {
          label: '되돌리기',
          onClick: () => {
            undoUpload(undoId)
              .then((res) => {
                setRefreshTrigger((n) => n + 1);
                addToast('success', res.message);
              })
              .catch((err) => addToast('error', err instanceof Error ? err.message : '되돌리기 실패'));
          },
        });
      } else {
        addToast('success', message);
      }
    },
    [addToast],
  );

  const handleUploadError = useCallback(
    (message: string) => {
      addToast('error', message);
    },
    [addToast],
  );

  /** Excel 파일 로딩을 백그라운드로 처리 — 모달을 닫아도 계속 진행 */
  const handleRequestLoad = useCallback(
    (file: File, fileName: string) => {
      const id = `report-${Date.now()}`;
      const label = fileName.replace(/\.xlsx?$/i, '');

      setPendingLoads((prev) => [...prev, { id, label }]);
      setUploadOpen(false);

      loadExcelReport(file)
        .then((data) => {
          const newReport: ImportedReport = { id, label, data, file };
          setImportedReports((prev) => [...prev, newReport]);
          setActiveDashTab(id);
          saveActiveTab(id);
          persistReport(newReport).catch(() => {});
          addToast('success', `"${label}" 리포트를 불러왔습니다.`);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : '불러오기 실패';
          addToast('error', `"${label}" 불러오기 실패: ${msg}`);
        })
        .finally(() => {
          setPendingLoads((prev) => prev.filter((p) => p.id !== id));
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

  const handleSaveImported = useCallback(
    (id: string, replace: boolean) => {
      const report = importedReports.find((r) => r.id === id);
      if (!report) return;

      const taskId = `save-${Date.now()}`;
      const label = `${report.data.period} DB 저장 중…`;
      setSaveTasks((prev) => [...prev, { id: taskId, label, status: 'pending', progress: 0 }]);

      startSaveExcelTask(report.file, replace)
        .then(({ task_id }) => {
          setSaveTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status: 'processing', progress: 5 } : t)),
          );

          let errorCount = 0;
          const poll = setInterval(() => {
            getSaveExcelTaskStatus(task_id)
              .then((res) => {
                errorCount = 0;
                if (res.status === 'done') {
                  clearInterval(poll);
                  setRefreshTrigger((n) => n + 1);
                  setSaveTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId
                        ? { ...t, status: 'done', progress: 100, message: res.message }
                        : t,
                    ),
                  );
                } else if (res.status === 'error') {
                  clearInterval(poll);
                  setSaveTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId
                        ? { ...t, status: 'error', progress: 0, message: res.error ?? '저장 실패' }
                        : t,
                    ),
                  );
                } else {
                  const progress = typeof res.progress === 'number' ? res.progress : undefined;
                  setSaveTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId ? { ...t, ...(progress != null ? { progress } : {}) } : t,
                    ),
                  );
                }
              })
              .catch(() => {
                errorCount++;
                if (errorCount >= 5) {
                  clearInterval(poll);
                  setSaveTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId
                        ? { ...t, status: 'error', progress: 0, message: '네트워크 오류로 저장 상태를 확인할 수 없습니다.' }
                        : t,
                    ),
                  );
                }
              });
          }, 600);
        })
        .catch((err) => {
          setSaveTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, status: 'error', progress: 0, message: err instanceof Error ? err.message : '저장 실패' }
                : t,
            ),
          );
        });
    },
    [importedReports],
  );

  const handleTabChange = useCallback((id: string) => {
    setActiveDashTab(id);
    saveActiveTab(id);
  }, []);

  const openUpload = useCallback(() => setUploadOpen(true), []);

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <BottomTaskBar tasks={saveTasks} onRemove={(id) => setSaveTasks((prev) => prev.filter((t) => t.id !== id))} />

      {/* 업로드 모달 */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="데이터 업로드"
        icon="bx-cloud-upload"
        size="lg"
      >
        <MainTabs
          onSuccess={handleUploadSuccess}
          onError={handleUploadError}
          onRequestLoad={handleRequestLoad}
        />
      </Modal>

      <div className="min-h-screen flex flex-col">
        {/* 배경 */}
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(37,99,235,0.12),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(248,250,252,0.8))]" />
        </div>

        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-600/20 shrink-0">
                <i className="bx bx-line-chart text-white text-xl" />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 truncate">SA 광고 대시보드</h1>
                <p className="text-[11px] text-slate-500 hidden sm:block">
                  매체 · 전환 데이터 분석 파이프라인
                </p>
              </div>
            </div>
            <nav className="flex items-center gap-1 text-xs font-medium shrink-0">
              <a
                href="#saved-report"
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                리포트
              </a>
              <button
                onClick={openUpload}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                업로드
              </button>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-12">
          {/* 히어로 · 작업 선택 */}
          <section aria-label="시작하기">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">
              Marketing Data Pipeline
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
              무엇을 하시겠어요?
            </h2>
            <p className="text-sm text-slate-500 mb-6 max-w-xl leading-relaxed">
              이미 저장된 데이터가 있으면 리포트부터 확인하고, 새 파일이 있다면 업로드를
              시작하세요.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {QUICK_ACTIONS.map((action) =>
                action.id === 'upload' ? (
                  <button
                    key={action.id}
                    onClick={openUpload}
                    className={`group relative flex gap-4 p-5 rounded-2xl border bg-gradient-to-br ${action.accent} bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left`}
                  >
                    <span
                      className={`flex items-center justify-center w-11 h-11 rounded-xl ${action.iconBg} text-white shadow-sm shrink-0`}
                    >
                      <i className={`bx ${action.icon} text-xl`} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                        {action.title}
                        <i className="bx bx-right-arrow-alt text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {action.description}
                      </p>
                    </div>
                  </button>
                ) : (
                  <a
                    key={action.id}
                    href={action.href}
                    className={`group relative flex gap-4 p-5 rounded-2xl border bg-gradient-to-br ${action.accent} bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
                  >
                    <span
                      className={`flex items-center justify-center w-11 h-11 rounded-xl ${action.iconBg} text-white shadow-sm shrink-0`}
                    >
                      <i className={`bx ${action.icon} text-xl`} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                        {action.title}
                        <i className="bx bx-right-arrow-alt text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {action.description}
                      </p>
                    </div>
                  </a>
                ),
              )}
            </div>

            <ol className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold text-[10px]">
                  1
                </span>
                연·월 선택 후 리포트 확인
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold text-[10px]">
                  2
                </span>
                CSV / Excel 업로드
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold text-[10px]">
                  3
                </span>
                DB 저장 후 대시보드에서 재조회
              </li>
            </ol>
          </section>

          {/* 01 리포트 대시보드 */}
          <section id="saved-report" className="scroll-mt-24">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 p-5 sm:p-7">
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
                refreshTrigger={refreshTrigger}
                onOpenUpload={openUpload}
                activeTab={activeDashTab}
                onTabChange={handleTabChange}
              />
            </div>
          </section>
        </main>

        <footer className="border-t border-slate-200/60 bg-white/60 mt-4">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <span>SA 광고 대시보드</span>
            <span>&copy; {new Date().getFullYear()} Marketing Data Pipeline</span>
          </div>
        </footer>
      </div>
    </>
  );
}
