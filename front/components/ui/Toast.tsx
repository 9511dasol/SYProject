'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  action?: { label: string; onClick: () => void };
}

function SingleToast({ toast, onRemove }: { toast: ToastItem; onRemove: () => void }) {
  const timeout = toast.action ? 10000 : 4500;

  useEffect(() => {
    const t = setTimeout(onRemove, timeout);
    return () => clearTimeout(t);
  }, [onRemove, timeout]);

  const isSuccess = toast.type === 'success';

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 px-4 py-3.5 rounded-xl shadow-lg shadow-black/10 text-sm font-medium
        animate-in slide-in-from-right-4 fade-in duration-200
        ${isSuccess
          ? 'bg-emerald-600 text-white'
          : 'bg-red-600 text-white'
        }`}
    >
      <i
        className={`bx ${isSuccess ? 'bx-check-circle' : 'bx-error-circle'} text-xl shrink-0 mt-px`}
      />
      <span className="flex-1 leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onRemove(); }}
          className="shrink-0 underline underline-offset-2 opacity-90 hover:opacity-100 transition-opacity whitespace-nowrap"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onRemove}
        aria-label="알림 닫기"
        className="opacity-70 hover:opacity-100 transition-opacity shrink-0 mt-px"
      >
        <i className="bx bx-x text-xl" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-label="알림"
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <SingleToast toast={t} onRemove={() => onRemove(t.id)} />
        </div>
      ))}
    </div>
  );
}
