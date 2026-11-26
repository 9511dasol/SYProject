'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api/authFetch';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { controlClassName } from '@/components/ui/Field';
import type { DevAuditLog, DevAuditLogListResponse, DevCompanyListResponse } from '@/types/dev';

const PAGE_SIZE = 50;

/** action 코드 → 사람이 읽는 라벨. 모르는 코드는 원문 그대로 보여준다. */
const ACTION_LABELS: Record<string, string> = {
  'company.create': '기업 생성',
  'company.active_change': '기업 정지/재개',
  'budget.set': '예산 설정',
  'user.create': '계정 생성',
  'user.role_change': '권한 변경',
  'user.active_change': '계정 활성/비활성',
  'user.unlock': '잠금 해제',
  'user.profile_change': '계정 정보 변경',
  'user.password_reset': '비밀번호 초기화',
  'user.delete': '계정 삭제',
  'user.promote_dev': 'dev 승격',
  'trial.create': '체험 발급',
  'trial.extend': '체험 연장',
  'trial.delete': '체험 삭제',
  'data.view_as_dev': 'dev 데이터 열람',
};

export default function DevAuditLogsClient() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);

  const companiesQuery = useQuery({
    queryKey: queryKeys.devCompanies(),
    queryFn: () =>
      fetchJson<DevCompanyListResponse>('/api/dev/companies', undefined, '기업 목록 조회 실패'),
  });

  const logsQuery = useQuery({
    queryKey: queryKeys.devAuditLogs(companyId, action, offset),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (companyId !== null) params.set('company_id', String(companyId));
      if (action) params.set('action', action);
      return fetchJson<DevAuditLogListResponse>(
        `/api/dev/audit-logs?${params}`,
        undefined,
        '감사 로그 조회 실패',
      );
    },
  });

  const companies = companiesQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;

  const columns: Column<DevAuditLog>[] = [
    {
      header: '시각',
      className: 'text-fg-subtle whitespace-nowrap',
      cell: (log) => new Date(log.created_at).toLocaleString('ko-KR'),
    },
    {
      header: '행위자',
      primary: true,
      className: 'font-medium text-fg',
      cell: (log) => log.actor_email,
    },
    { header: '행위', cell: (log) => ACTION_LABELS[log.action] ?? log.action },
    {
      header: '대상 기업',
      cell: (log) =>
        log.company_id === null
          ? '전역'
          : companies.find((c) => c.id === log.company_id)?.name ?? `기업 #${log.company_id}`,
    },
    {
      header: '상세',
      className: 'text-fg-subtle',
      cell: (log) => {
        const entries = Object.entries(log.detail ?? {});
        if (entries.length === 0) return '—';
        return (
          <span className="text-xs">
            {entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
          </span>
        );
      },
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-fg">감사 로그</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            기업·계정·예산 변경과 dev 의 데이터 열람까지, 운영 행위 전수가 기록됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="기업 필터"
            value={companyId ?? ''}
            onChange={(e) => {
              setCompanyId(e.target.value === '' ? null : Number(e.target.value));
              setOffset(0);
            }}
            className={`${controlClassName} w-auto px-2.5 py-1.5`}
          >
            <option value="">전체 기업</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="행위 필터"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
            className={`${controlClassName} w-auto px-2.5 py-1.5`}
          >
            <option value="">전체 행위</option>
            {Object.entries(ACTION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {logsQuery.error && <Alert>{logsQuery.error.message}</Alert>}

      <DataTable
        rows={logsQuery.data?.items ?? null}
        rowKey={(log) => log.id}
        columns={columns}
        minWidth="min-w-200"
        empty={{ icon: 'bx-shield-quarter', title: '기록된 행위가 없습니다.' }}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-fg-subtle">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total.toLocaleString()}건
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              이전
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              다음
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
