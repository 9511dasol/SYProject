'use client';

import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import Spinner from '@/components/ui/Spinner';

/**
 * dev(플랫폼 운영자)만 children 을 볼 수 있게 한다.
 *
 * AdminGate 와 같은 구조 — 실제 권한 검증은 proxy.ts 와 FastAPI(require_dev)가
 * 다시 수행하며, 여기서 막는 건 화면 노출뿐이다.
 */
export default function DevGate({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (session?.user.role !== 'dev') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-lock-alt text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">접근 권한이 없습니다</h2>
        <p className="text-sm text-fg-subtle">개발자(dev) 계정만 접근할 수 있는 페이지입니다.</p>
      </div>
    );
  }

  return <>{children}</>;
}
