'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Spinner from '@/components/ui/Spinner';

/** 로그인하지 않았으면 children 대신 로그인 안내를 표시한다. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh] px-6 text-center">
        <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-soft text-primary">
          <i className="bx bx-lock-alt text-3xl" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-fg">로그인이 필요합니다</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            이 기능은 로그인한 사용자만 이용할 수 있습니다.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold
            bg-primary text-white hover:brightness-110 active:scale-[0.98] shadow-sm shadow-primary/20 transition-all"
        >
          로그인하러 가기
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
