'use client';

import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import Spinner from '@/components/ui/Spinner';

/**
 * 관리자만 children 을 볼 수 있게 한다.
 *
 * 이 로딩 + 권한없음 블록이 관리자 화면 5곳에 글자 단위로 복붙돼 있었다. 게이트를
 * page.tsx 로 끌어올리면 클라이언트 컴포넌트는 "이미 관리자"라고 가정할 수 있어서,
 * isAdmin 계산과 그걸로 fetch 를 막던 가드까지 함께 사라진다.
 *
 * 실제 권한 검증은 proxy.ts 와 각 Route Handler · FastAPI 가 다시 수행한다 —
 * 여기서 막는 건 화면 노출뿐이다.
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (session?.user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-lock-alt text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">접근 권한이 없습니다</h2>
        <p className="text-sm text-fg-subtle">관리자만 접근할 수 있는 페이지입니다.</p>
      </div>
    );
  }

  return <>{children}</>;
}
