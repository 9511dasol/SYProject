'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { formatCount, formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { Input, Select } from '@/components/ui/Field';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import type { AIToolKey, AIToolUsageLogItem, AIToolUsageLogListResponse, AIUsageSummary } from '@/types/aiUsageLog';

const TOOL_LABELS: Record<AIToolKey, string> = {
  image_filter: '이미지 정제',
  image_resize: '리사이저 (AI 업스케일)',
  heading_suggest: '헤딩 문구 추천',
  marketing_comment: '마케팅 코멘트 생성',
  report_mail: '리포트 메일 코멘트',
};

const PAGE_SIZE = 50;

/** 사용률 구간별 미터 색상 — 텍스트로도 항상 정확한 수치를 함께 보여주므로 색상에만 의존하지 않는다. */
function meterColor(ratio: number): string {
  if (ratio >= 1) return 'bg-red-500';
  if (ratio >= 0.7) return 'bg-amber-500';
  return 'bg-primary';
}

function UsageSummaryPanel() {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: queryKeys.adminAiUsageSummary(),
    queryFn: () =>
      fetchJson<AIUsageSummary>(
        '/api/admin/ai-usage-logs/summary',
        undefined,
        '사용량 요약 조회 실패',
      ),
  });

  const saveBudget = useMutation({
    mutationFn: (value: number) =>
      sendJson<AIUsageSummary>(
        '/api/admin/ai-usage-logs/budget',
        'PATCH',
        { monthly_token_budget: Math.round(value) },
        '예산 설정 실패',
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.adminAiUsageSummary(), data);
      // 저장이 끝나면 다시 서버 값에서 파생되게 되돌린다
      setDraftBudget(null);
    },
  });

  const summary = summaryQuery.data ?? null;
  const error = summaryQuery.error ?? saveBudget.error;
  const saving = saveBudget.isPending;

  /*
    입력칸 값은 서버 값에서 파생시키고, 사용자가 손대면 그때부터 draft 를 쓴다.
    조회 결과를 state 로 복사해 두면 백그라운드 재조회가 입력 중인 값을 덮어쓴다.
  */
  const [draftBudget, setDraftBudget] = useState<string | null>(null);
  const budgetInput = draftBudget ?? String(summary?.monthly_token_budget || '');

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(budgetInput);
    if (!Number.isFinite(value) || value < 0) return;
    saveBudget.mutate(value);
  };

  if (!summary) {
    return (
      <div className="flex justify-center py-6 rounded-xl border border-border bg-surface">
        <Spinner />
      </div>
    );
  }

  const budget = summary.monthly_token_budget;
  const ratio = budget > 0 ? summary.total_tokens / budget : 0;
  const remaining = budget > 0 ? Math.max(0, budget - summary.total_tokens) : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-fg">{summary.month} 토큰 사용량</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Gemini 응답의 usage_metadata를 합산한 값입니다. Google 실제 과금과는 무관한 내부 참고용 수치입니다.
          </p>
        </div>
        <form onSubmit={handleSaveBudget} className="flex items-end gap-2">
          <Input
            label="월간 예산(토큰)"
            type="number"
            min={0}
            value={budgetInput}
            onChange={(e) => setDraftBudget(e.target.value)}
            placeholder="미설정"
            className="w-32 px-2.5 py-1.5"
          />
          <Button type="submit" size="sm" isLoading={saving} className="mb-0.5">
            저장
          </Button>
        </form>
      </div>

      {error && (
        <Alert icon={false} className="px-3 py-2 text-xs">
          {error.message}
        </Alert>
      )}

      {budget > 0 ? (
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${meterColor(ratio)}`}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-fg-subtle">
            <span>
              <span className="font-semibold text-fg">{formatCount(summary.total_tokens)}</span> / {formatCount(budget)} 토큰 사용
              ({Math.round(ratio * 100)}%)
            </span>
            <span>{remaining !== null && remaining > 0 ? `${formatCount(remaining)} 토큰 남음` : '예산 초과'}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg">
          이번 달 사용량: <span className="font-semibold">{formatCount(summary.total_tokens)}</span> 토큰
          <span className="ml-2 text-xs text-fg-subtle">(월간 예산을 설정하면 잔여량도 함께 표시됩니다)</span>
        </p>
      )}

      {Object.keys(summary.by_tool).length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle border-t border-border-soft pt-3">
          {(Object.entries(summary.by_tool) as [AIToolKey, number][]).map(([key, tokens]) => (
            <span key={key}>
              {TOOL_LABELS[key]}: <span className="font-medium text-fg">{formatCount(tokens)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAiUsageLogsClient() {
  const [tool, setTool] = useState<AIToolKey | ''>('');
  const [offset, setOffset] = useState(0);

  const logsQuery = useQuery({
    queryKey: queryKeys.adminAiUsageLogs(tool, offset),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (tool) params.set('tool', tool);
      return fetchJson<AIToolUsageLogListResponse>(
        `/api/admin/ai-usage-logs?${params.toString()}`,
        undefined,
        '사용 이력 조회 실패',
      );
    },
    // 페이지를 넘길 때 목록이 사라지고 스피너가 뜨는 대신, 이전 페이지를 잠깐 유지한다
    placeholderData: (prev) => prev,
  });

  const logs = logsQuery.data?.items ?? null;
  const total = logsQuery.data?.total ?? 0;
  const error = logsQuery.error;

  const columns: Column<AIToolUsageLogItem>[] = [
    {
      header: '시각',
      primary: true,
      className: 'text-fg-subtle whitespace-nowrap',
      cell: (log) => formatDateTime(log.created_at),
    },
    {
      header: '사용자',
      primary: true,
      className: 'text-fg',
      cell: (log) => log.user_email,
    },
    {
      header: '기능',
      className: 'whitespace-nowrap',
      cell: (log) => TOOL_LABELS[log.tool] ?? log.tool,
    },
    {
      // 이미지 도구는 파일명, 코멘트 생성은 대상 기간이 들어온다
      header: '대상',
      className: 'max-w-50 truncate',
      title: (log) => log.image_filename,
      cell: (log) => log.image_filename,
    },
    {
      header: '프롬프트',
      className: 'max-w-100 truncate',
      title: (log) => log.prompt,
      cell: (log) => log.prompt || <span className="text-fg-subtle">-</span>,
    },
    {
      header: '토큰',
      align: 'right',
      className: 'whitespace-nowrap',
      title: (log) =>
        log.total_tokens != null
          ? `입력 ${formatCount(log.prompt_tokens ?? 0)} · 출력 ${formatCount(log.output_tokens ?? 0)}`
          : undefined,
      cell: (log) =>
        log.total_tokens != null ? formatCount(log.total_tokens) : <span className="text-fg-subtle">-</span>,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">AI 도구 사용 이력</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          이미지 정제 · 리사이저 AI 업스케일 · 헤딩 문구 추천 — 실제로 Gemini를 호출한 사용 이력입니다.
          이미지 파일 자체는 저장되지 않으며 파일명 · 프롬프트만 기록됩니다.
        </p>
      </div>

      <UsageSummaryPanel />

      <div className="sm:max-w-64">
        <Select
          label="기능"
          value={tool}
          onChange={(e) => {
            setTool(e.target.value as AIToolKey | '');
            setOffset(0);
          }}
        >
          <option value="">전체</option>
          {(Object.entries(TOOL_LABELS) as [AIToolKey, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </div>

      {error && <Alert>{error.message}</Alert>}

      <DataTable
        rows={logs}
        rowKey={(log) => log.id}
        columns={columns}
        minWidth="min-w-180"
        empty={{ icon: 'bx-history', title: '기록된 사용 이력이 없습니다.' }}
      />

      <Pagination total={total} pageSize={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} />
    </div>
  );
}
