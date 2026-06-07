'use client';

import { useQuery } from '@tanstack/react-query';
import { pollTaskStatus } from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import type { TaskStatusResponse } from '@/types/marketing';
import Spinner from '@/components/ui/Spinner';
import ResultCard from '@/components/marketing/ResultCard';

interface StatusPollerProps {
  taskId: string;
  onReset: () => void;
}

const TERMINAL = new Set<TaskStatusResponse['status']>(['completed', 'failed']);

export default function StatusPoller({ taskId, onReset }: StatusPollerProps) {
  const { data: taskStatus, isError } = useQuery({
    queryKey: queryKeys.taskStatus(taskId),
    queryFn: () => pollTaskStatus(taskId),
    refetchInterval: (query) =>
      TERMINAL.has(query.state.data?.status as TaskStatusResponse['status']) ? false : 2000,
    retry: 3,
    retryDelay: 1500,
    staleTime: 0,
  });

  const isPending = !taskStatus || taskStatus.status === 'pending';
  const isProcessing = taskStatus?.status === 'processing';

  if (isError) {
    return (
      <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6">
        <div className="flex items-center gap-2 mb-2">
          <i className="bx bx-error-circle text-red-500 text-xl" />
          <p className="text-sm font-semibold text-red-700">분석 실패</p>
        </div>
        <p className="text-sm text-red-600">상태 조회 중 오류가 발생했습니다.</p>
        <button
          onClick={onReset}
          className="mt-4 text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <i className="bx bx-refresh" /> 다시 시도
        </button>
      </div>
    );
  }

  if (isPending || isProcessing) {
    return (
      <div className="mt-6 flex flex-col items-center gap-4 py-10 rounded-2xl border border-slate-100 bg-slate-50">
        <Spinner size="lg" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            {isPending ? '분석 대기 중...' : 'AI 분석 중...'}
          </p>
          <p className="text-xs text-slate-400 mt-1">잠시만 기다려 주세요</p>
        </div>
      </div>
    );
  }

  if (taskStatus?.status === 'failed') {
    return (
      <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6">
        <div className="flex items-center gap-2 mb-2">
          <i className="bx bx-error-circle text-red-500 text-xl" />
          <p className="text-sm font-semibold text-red-700">분석 실패</p>
        </div>
        <p className="text-sm text-red-600">{taskStatus.error ?? '알 수 없는 오류가 발생했습니다.'}</p>
        <button
          onClick={onReset}
          className="mt-4 text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <i className="bx bx-refresh" /> 다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <ResultCard
        processedRows={taskStatus?.processed_rows ?? 0}
        aiComment={taskStatus?.ai_comment ?? ''}
        onReset={onReset}
      />
    </div>
  );
}
