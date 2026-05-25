'use client';

import { useEffect } from 'react';

export type TaskProgress = {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number; // 0-100
  message?: string;
};

interface Props {
  tasks: TaskProgress[];
  onRemove: (id: string) => void;
}

function TaskItem({ task, onRemove }: { task: TaskProgress; onRemove: () => void }) {
  const isDone = task.status === 'done';
  const isError = task.status === 'error';
  const isFinished = isDone || isError;
  const isActive = !isFinished;
  const progress = task.progress ?? 0;

  useEffect(() => {
    if (!isDone) return;
    const t = setTimeout(onRemove, 5000);
    return () => clearTimeout(t);
  }, [isDone, onRemove]);

  return (
    <div
      className={`rounded-xl shadow-lg text-sm font-medium overflow-hidden transition-colors
        ${isDone ? 'bg-emerald-600 text-white' : isError ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'}`}
    >
      {/* 상단 행 */}
      <div className="flex items-center gap-3 px-4 py-3">
        {!isFinished ? (
          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
        ) : isDone ? (
          <i className="bx bx-check-circle text-lg shrink-0" />
        ) : (
          <i className="bx bx-error-circle text-lg shrink-0" />
        )}
        <span className="flex-1 leading-snug">{task.message ?? task.label}</span>
        {isActive && progress > 0 && (
          <span className="tabular-nums text-xs text-white/60 shrink-0">{progress}%</span>
        )}
        {isFinished && (
          <button
            onClick={onRemove}
            aria-label="닫기"
            className="opacity-70 hover:opacity-100 transition-opacity shrink-0"
          >
            <i className="bx bx-x text-lg" />
          </button>
        )}
      </div>

      {/* 진행률 바 */}
      {isActive && progress > 0 && (
        <div className="px-4 pb-2.5">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/80 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function BottomTaskBar({ tasks, onRemove }: Props) {
  if (!tasks.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-72 pointer-events-none">
      {tasks.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <TaskItem task={t} onRemove={() => onRemove(t.id)} />
        </div>
      ))}
    </div>
  );
}
