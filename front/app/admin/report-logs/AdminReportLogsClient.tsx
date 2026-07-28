'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { authFetch } from '@/lib/api/authFetch';
import Spinner from '@/components/ui/Spinner';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import type {
  ReportLogItem,
  ReportLogListResponse,
  ReportLogStatus,
  ReportResendResponse,
} from '@/types/reportLog';

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<ReportLogStatus, string> = {
  sent: '발송 완료',
  error: '실패',
};

const STATUS_STYLES: Record<ReportLogStatus, string> = {
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40',
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function periodLabel(log: ReportLogItem): string {
  return `${log.curr_year}년 ${log.curr_month}월 (직전 ${log.prev_year}년 ${log.prev_month}월 대비)`;
}

function StatusBadge({ status }: { status: ReportLogStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      <i className={`bx ${status === 'sent' ? 'bx-check' : 'bx-x'} text-sm`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function AdminReportLogsClient() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = sessionStatus === 'authenticated' && session?.user.role === 'admin';

  const [statusFilter, setStatusFilter] = useState<ReportLogStatus | ''>('');
  const [offset, setOffset] = useState(0);
  const [logs, setLogs] = useState<ReportLogItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<ReportLogStatus, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((type: ToastItem['type'], message: string) => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }]);
  }, []);

  const load = useCallback(() => {
    if (!isAdmin) return;

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (statusFilter) params.set('status', statusFilter);

    authFetch(`/api/admin/report-logs?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? data.message ?? '발송 이력 조회 실패');
        return data as ReportLogListResponse;
      })
      .then((data) => {
        setLogs(data.items);
        setTotal(data.total);
        setCounts(data.counts);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '발송 이력 조회 실패'));
  }, [isAdmin, statusFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResend = async (log: ReportLogItem) => {
    setResendingId(log.id);
    try {
      const res = await authFetch(`/api/admin/report-logs/${log.id}/resend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.message ?? '재발송 실패');

      const { recipients } = data as ReportResendResponse;
      pushToast('success', `${recipients.length}명에게 재발송했습니다.`);
      load();
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '재발송 실패');
    } finally {
      setResendingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (sessionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-lock-alt text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">접근 권한이 없습니다</h2>
        <p className="text-sm text-fg-subtle">관리자만 접근할 수 있는 페이지입니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      <div>
        <h1 className="text-xl font-bold text-fg">리포트 발송 로그</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          리포트 메일은 백그라운드로 발송되어 실패해도 화면에 바로 드러나지 않습니다.
          여기서 결과를 확인하고, 실패한 건은 같은 조건으로 다시 보낼 수 있습니다.
        </p>
      </div>

      {/* 상태 요약 */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        {(['sent', 'error'] as const).map((key) => (
          <div key={key} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs text-fg-subtle">{STATUS_LABELS[key]}</p>
            <p className={`mt-0.5 text-lg font-bold ${key === 'error' && (counts.error ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg'}`}>
              {(counts[key] ?? 0).toLocaleString('ko-KR')}건
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">상태</label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ReportLogStatus | '');
            setOffset(0);
          }}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg
            focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">전체</option>
          <option value="sent">발송 완료</option>
          <option value="error">실패</option>
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
          dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!logs ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <i className="bx bx-mail-send text-3xl text-fg-subtle" />
          <p className="text-sm text-fg-subtle">발송 이력이 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-200 text-sm">
              <thead>
                <tr className="border-b border-border-soft text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3">시각</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">대상 기간</th>
                  <th className="px-4 py-3">수신자</th>
                  <th className="px-4 py-3">제목 / 실패 사유</th>
                  <th className="px-4 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-fg-subtle whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{periodLabel(log)}</td>
                    <td className="px-4 py-3 text-fg-muted max-w-50 truncate" title={log.recipients}>
                      {log.recipients || <span className="text-fg-subtle">-</span>}
                    </td>
                    <td className="px-4 py-3 max-w-100">
                      <p className="text-fg truncate" title={log.subject}>{log.subject}</p>
                      {log.error_msg && (
                        <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 truncate" title={log.error_msg}>
                          {log.error_msg}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {log.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => handleResend(log)}
                          disabled={resendingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5
                            text-xs font-semibold text-fg hover:bg-surface-2
                            disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {resendingId === log.id ? (
                            <span className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                          ) : (
                            <i className="bx bx-refresh text-sm" />
                          )}
                          재발송
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-fg-subtle">
            재발송은 원래 실패 기록을 고쳐 쓰지 않고 새 시도로 남습니다 — 언제 무엇이 실패했는지가 이력에 그대로 보존됩니다.
          </p>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm text-fg-subtle">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
              >
                이전
              </button>
              <span>{currentPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
