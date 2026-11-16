'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * 관리자 화면 전용 오류 경계.
 *
 * 예전에는 루트(app/error.tsx)만 있어서, 관리자 화면 한 곳에서 터진 오류가 앱 전체를
 * 덮었다 — 사이드바까지 사라져 다른 관리 화면으로 넘어갈 방법이 없었다. 세그먼트에
 * 경계를 두면 레이아웃은 남고 본문만 교체된다.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center"
    >
      <div
        className="flex items-center justify-center w-14 h-14 rounded-2xl
          bg-badge-danger-bg border border-badge-danger-bdr shadow-card"
      >
        <i className="bx bx-error-circle text-2xl text-badge-danger-fg" />
      </div>

      <div className="mt-4 space-y-2">
        <h1 className="text-lg font-bold text-fg tracking-tight">
          이 화면을 불러오지 못했습니다
        </h1>
        <p className="text-sm text-fg-muted max-w-xs leading-relaxed">
          다른 관리 메뉴는 그대로 쓸 수 있습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>
        {error.message && (
          <p
            className="mt-2 text-xs text-fg-subtle font-mono bg-surface-2 border border-border
              rounded-lg px-3 py-2 max-w-sm truncate"
          >
            {error.message}
          </p>
        )}
      </div>

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
          대시보드
        </Link>
      </div>
    </div>
  );
}
