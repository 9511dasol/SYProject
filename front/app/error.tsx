'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center"
    >
      {/* 아이콘 */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl
          bg-badge-danger-bg border border-badge-danger-bdr shadow-card"
      >
        <i className="bx bx-error-circle text-3xl text-badge-danger-fg" />
      </div>

      {/* 배지 */}
      <span className="mt-4 badge badge-danger px-3 py-1 text-xs tracking-wide">
        <i className="bx bx-x-circle text-sm" />
        오류 발생
      </span>

      {/* 텍스트 */}
      <div className="mt-4 space-y-2">
        <h1 className="text-xl font-bold text-fg tracking-tight">
          페이지를 불러오지 못했습니다
        </h1>
        <p className="text-sm text-fg-muted max-w-xs leading-relaxed">
          예기치 못한 오류가 발생했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>
        {error.message && (
          <p className="mt-2 text-xs text-fg-subtle font-mono bg-surface-2 border border-border
            rounded-lg px-3 py-2 max-w-sm truncate">
            {error.message}
          </p>
        )}
      </div>

      <div className="mt-6 w-12 h-px bg-border" />

      {/* 액션 버튼 */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
            bg-primary text-primary-fg hover:brightness-110 active:scale-[0.98] transition-all shadow-card"
        >
          <i className="bx bx-refresh" />
          다시 시도
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
            border border-border bg-surface text-fg-muted hover:bg-surface-2 transition-colors"
        >
          <i className="bx bx-home-alt" />
          홈으로
        </Link>
      </div>
    </div>
  );
}
