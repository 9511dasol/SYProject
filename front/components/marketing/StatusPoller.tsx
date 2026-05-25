'use client';

import { useEffect, useState } from 'react';
import { pollTaskStatus } from '@/lib/marketingClient';
import type { TaskStatusResponse } from '@/types/marketing';
import Spinner from '@/components/ui/Spinner';
import ResultCard from '@/components/marketing/ResultCard';

interface StatusPollerProps {
  taskId: string;
  onReset: () => void;
}

const POLL_INTERVAL_MS = 2000;

export default function StatusPoller({ taskId, onReset }: StatusPollerProps) {
  const [taskStatus, setTaskStatus] = useState<TaskStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await pollTaskStatus(taskId);
        if (cancelled) return;
        setTaskStatus(data);
        if (data.status === 'completed' || data.status === 'failed') return;
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          setTaskStatus({ task_id: taskId, status: 'failed', error: '상태 조회 중 오류가 발생했습니다.' });
        }
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [taskId]);

  const isPending = !taskStatus || taskStatus.status === 'pending';
  const isProcessing = taskStatus?.status === 'processing';

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

  if (taskStatus.status === 'failed') {
    return (
      <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6">
        <div className="flex items-center gap-2 mb-2">
          <i className="bx bx-error-circle text-red-500 text-xl" />
          <p className="text-sm font-semibold text-red-700">분석 실패</p>
        </div>
        <p className="text-sm text-red-600">
          {taskStatus.error ?? '알 수 없는 오류가 발생했습니다.'}
        </p>
        <button
          onClick={onReset}
          className="mt-4 text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <i className="bx bx-refresh" />
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <ResultCard
        processedRows={taskStatus.processed_rows ?? 0}
        aiComment={taskStatus.ai_comment ?? ''}
        onReset={onReset}
      />
    </div>
  );
}
