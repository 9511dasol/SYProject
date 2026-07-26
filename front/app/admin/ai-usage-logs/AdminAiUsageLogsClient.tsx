'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { authFetch } from '@/lib/api/authFetch';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import type { AIToolKey, AIToolUsageLogItem, AIToolUsageLogListResponse, AIUsageSummary } from '@/types/aiUsageLog';

const TOOL_LABELS: Record<AIToolKey, string> = {
  image_filter: '이미지 정제',
  image_resize: '리사이저 (AI 업스케일)',
  heading_suggest: '헤딩 문구 추천',
};

const PAGE_SIZE = 50;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTokens(value: number): string {
  return value.toLocaleString('ko-KR');
}

/** 사용률 구간별 미터 색상 — 텍스트로도 항상 정확한 수치를 함께 보여주므로 색상에만 의존하지 않는다. */
function meterColor(ratio: number): string {
  if (ratio >= 1) return 'bg-red-500';
  if (ratio >= 0.7) return 'bg-amber-500';
  return 'bg-primary';
}

function UsageSummaryPanel({ isAdmin }: { isAdmin: boolean }) {
  const [summary, setSummary] = useState<AIUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSummary = useCallback(() => {
    if (!isAdmin) return;
    authFetch('/api/admin/ai-usage-logs/summary')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '사용량 요약 조회 실패');
        return data as AIUsageSummary;
      })
      .then((data) => {
        setSummary(data);
        setBudgetInput(String(data.monthly_token_budget || ''));
      })
      .catch((err) => setError(err instanceof Error ? err.message : '사용량 요약 조회 실패'));
  }, [isAdmin]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(budgetInput);
    if (!Number.isFinite(value) || value < 0) return;

    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/ai-usage-logs/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_token_budget: Math.round(value) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '예산 설정 실패');
      setSummary(data as AIUsageSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : '예산 설정 실패');
    } finally {
      setSaving(false);
    }
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
        <form onSubmit={handleSaveBudget} className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted whitespace-nowrap">
            월간 예산(토큰)
          </label>
          <input
            type="number"
            min={0}
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            placeholder="미설정"
            className="w-32 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg
              focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" isLoading={saving} className="px-3! py-1.5! text-xs">
            저장
          </Button>
        </form>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600
          dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
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
              <span className="font-semibold text-fg">{formatTokens(summary.total_tokens)}</span> / {formatTokens(budget)} 토큰 사용
              ({Math.round(ratio * 100)}%)
            </span>
            <span>{remaining !== null && remaining > 0 ? `${formatTokens(remaining)} 토큰 남음` : '예산 초과'}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg">
          이번 달 사용량: <span className="font-semibold">{formatTokens(summary.total_tokens)}</span> 토큰
          <span className="ml-2 text-xs text-fg-subtle">(월간 예산을 설정하면 잔여량도 함께 표시됩니다)</span>
        </p>
      )}

      {Object.keys(summary.by_tool).length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle border-t border-border-soft pt-3">
          {(Object.entries(summary.by_tool) as [AIToolKey, number][]).map(([key, tokens]) => (
            <span key={key}>
              {TOOL_LABELS[key]}: <span className="font-medium text-fg">{formatTokens(tokens)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAiUsageLogsClient() {
  const { data: session, status } = useSession();
  const isAdmin = status === 'authenticated' && session?.user.role === 'admin';

  const [tool, setTool] = useState<AIToolKey | ''>('');
  const [offset, setOffset] = useState(0);
  const [logs, setLogs] = useState<AIToolUsageLogItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (tool) params.set('tool', tool);

    authFetch(`/api/admin/ai-usage-logs?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '사용 이력 조회 실패');
        return data as AIToolUsageLogListResponse;
      })
      .then((data) => {
        setLogs(data.items);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '사용 이력 조회 실패'));
  }, [isAdmin, tool, offset]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (status === 'loading') {
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
      <div>
        <h1 className="text-xl font-bold text-fg">AI 도구 사용 이력</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          이미지 정제 · 리사이저 AI 업스케일 · 헤딩 문구 추천 — 실제로 Gemini를 호출한 사용 이력입니다.
          이미지 파일 자체는 저장되지 않으며 파일명 · 프롬프트만 기록됩니다.
        </p>
      </div>

      <UsageSummaryPanel isAdmin={isAdmin} />

      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">기능</label>
        <select
          value={tool}
          onChange={(e) => {
            setTool(e.target.value as AIToolKey | '');
            setOffset(0);
          }}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg
            focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">전체</option>
          {(Object.entries(TOOL_LABELS) as [AIToolKey, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
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
          <i className="bx bx-history text-3xl text-fg-subtle" />
          <p className="text-sm text-fg-subtle">기록된 사용 이력이 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="border-b border-border-soft text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3">시각</th>
                  <th className="px-4 py-3">사용자</th>
                  <th className="px-4 py-3">기능</th>
                  <th className="px-4 py-3">파일명</th>
                  <th className="px-4 py-3">프롬프트</th>
                  <th className="px-4 py-3 text-right">토큰</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-fg-subtle whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3 text-fg">{log.user_email}</td>
                    <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{TOOL_LABELS[log.tool]}</td>
                    <td className="px-4 py-3 text-fg-muted max-w-50 truncate" title={log.image_filename}>
                      {log.image_filename}
                    </td>
                    <td className="px-4 py-3 text-fg-muted max-w-100 truncate" title={log.prompt}>
                      {log.prompt || <span className="text-fg-subtle">-</span>}
                    </td>
                    <td
                      className="px-4 py-3 text-fg-muted text-right whitespace-nowrap"
                      title={
                        log.total_tokens != null
                          ? `입력 ${formatTokens(log.prompt_tokens ?? 0)} · 출력 ${formatTokens(log.output_tokens ?? 0)}`
                          : undefined
                      }
                    >
                      {log.total_tokens != null ? formatTokens(log.total_tokens) : <span className="text-fg-subtle">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
