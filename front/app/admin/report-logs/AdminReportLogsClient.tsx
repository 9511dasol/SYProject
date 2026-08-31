'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { formatCount, formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Field';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/providers/ToastProvider';
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

function periodLabel(log: ReportLogItem): string {
  return `${log.curr_year}년 ${log.curr_month}월 (직전 ${log.prev_year}년 ${log.prev_month}월 대비)`;
}

function StatusBadge({ status }: { status: ReportLogStatus }) {
  return (
    <span className={`badge ${status === 'sent' ? 'badge-success' : 'badge-danger'} whitespace-nowrap`}>
      <i className={`bx ${status === 'sent' ? 'bx-check' : 'bx-x'} text-sm`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function AdminReportLogsClient() {
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<ReportLogStatus | ''>('');
  const [offset, setOffset] = useState(0);

  const logsQuery = useQuery({
    queryKey: queryKeys.adminReportLogs(statusFilter, offset),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (statusFilter) params.set('status', statusFilter);
      return fetchJson<ReportLogListResponse>(
        `/api/admin/report-logs?${params.toString()}`,
        undefined,
        '발송 이력 조회 실패',
      );
    },
    // 페이지를 넘길 때 목록이 사라지고 스피너가 뜨는 대신, 이전 페이지를 잠깐 유지한다
    placeholderData: (prev) => prev,
  });

  const resend = useMutation({
    mutationFn: (log: ReportLogItem) =>
      sendJson<ReportResendResponse>(
        `/api/admin/report-logs/${log.id}/resend`,
        'POST',
        undefined,
        '재발송 실패',
      ),
    onSuccess: ({ recipients }) => {
      pushToast('success', `${recipients.length}명에게 재발송했습니다.`);
      // 재발송은 새 시도로 목록에 추가되므로 이 화면의 모든 페이지가 낡는다
      queryClient.invalidateQueries({ queryKey: queryKeys.allAdminReportLogs() });
    },
    onError: (err) => pushToast('error', err.message),
  });

  const logs = logsQuery.data?.items ?? null;
  const total = logsQuery.data?.total ?? 0;
  const counts = logsQuery.data?.counts ?? {};
  const error = logsQuery.error;
  const resendingId = resend.isPending ? resend.variables.id : null;

  const columns: Column<ReportLogItem>[] = [
    {
      header: '시각',
      primary: true,
      className: 'text-fg-subtle whitespace-nowrap',
      cell: (log) => formatDateTime(log.created_at),
    },
    {
      header: '상태',
      primary: true,
      cell: (log) => <StatusBadge status={log.status} />,
    },
    {
      header: '대상 기간',
      className: 'whitespace-nowrap',
      cell: (log) => periodLabel(log),
    },
    {
      header: '수신자',
      className: 'max-w-50 truncate',
      title: (log) => log.recipients,
      cell: (log) => log.recipients || <span className="text-fg-subtle">-</span>,
    },
    {
      header: '제목 / 실패 사유',
      className: 'max-w-100',
      title: (log) => log.subject,
      cell: (log) => (
        <>
          <p className="text-fg truncate">{log.subject}</p>
          {log.error_msg && (
            <p className="mt-0.5 text-xs text-badge-danger-fg truncate" title={log.error_msg}>
              {log.error_msg}
            </p>
          )}
        </>
      ),
    },
    {
      header: '작업',
      align: 'right',
      cell: (log) =>
        log.status === 'error' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resend.mutate(log)}
            disabled={resendingId !== null}
            isLoading={resendingId === log.id}
          >
            {resendingId !== log.id && <i className="bx bx-refresh text-sm" />}
            재발송
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
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
            <p
              className={`mt-0.5 text-lg font-bold ${
                key === 'error' && (counts.error ?? 0) > 0 ? 'text-badge-danger-fg' : 'text-fg'
              }`}
            >
              {formatCount(counts[key] ?? 0)}건
            </p>
          </div>
        ))}
      </div>

      <div className="sm:max-w-48">
        <Select
          label="상태"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ReportLogStatus | '');
            setOffset(0);
          }}
        >
          <option value="">전체</option>
          <option value="sent">발송 완료</option>
          <option value="error">실패</option>
        </Select>
      </div>

      {error && <Alert>{error.message}</Alert>}

      <DataTable
        rows={logs}
        rowKey={(log) => log.id}
        columns={columns}
        minWidth="min-w-200"
        empty={{ icon: 'bx-mail-send', title: '발송 이력이 없습니다.' }}
      />

      {logs && logs.length > 0 && (
        <>
          <p className="text-xs text-fg-subtle">
            재발송은 원래 실패 기록을 고쳐 쓰지 않고 새 시도로 남습니다 — 언제 무엇이 실패했는지가 이력에 그대로 보존됩니다.
          </p>
          <Pagination
            total={total}
            pageSize={PAGE_SIZE}
            offset={offset}
            onOffsetChange={setOffset}
          />
        </>
      )}
    </div>
  );
}
