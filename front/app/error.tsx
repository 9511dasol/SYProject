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
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      {/* 아이콘 */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl
          bg-linear-to-br from-rose-50 to-red-100 border border-rose-100 shadow-sm"
      >
        <i className="bx bx-error-circle text-3xl text-rose-500" />
      </div>

      {/* 배지 */}
      <span
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
          bg-rose-100 text-rose-600 tracking-wide"
      >
        <i className="bx bx-x-circle text-sm" />
        오류 발생
      </span>

      {/* 텍스트 */}
      <div className="mt-4 space-y-2">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">
          페이지를 불러오지 못했습니다
        </h1>
        <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
          예기치 못한 오류가 발생했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>
        {error.message && (
          <p className="mt-2 text-xs text-slate-400 font-mono bg-slate-50 border border-slate-200
            rounded-lg px-3 py-2 max-w-sm truncate">
            {error.message}
          </p>
        )}
      </div>

      <div className="mt-6 w-12 h-px bg-slate-200" />

      {/* 액션 버튼 */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
            bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm"
        >
          <i className="bx bx-refresh" />
          다시 시도
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
            border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <i className="bx bx-home-alt" />
          홈으로
        </Link>
      </div>
    </div>
  );
}
