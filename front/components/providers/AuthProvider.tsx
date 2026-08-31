'use client';

import { useEffect } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';

/**
 * accessToken 자동 갱신이 실패하면(refresh token 만료 등) 즉시 로그아웃시킨다.
 *
 * 세션 쿠키는 남아 있지만 더 이상 API를 호출할 수 없는 상태라, 그대로 두면 사용자는
 * 화면마다 401 만 만나게 된다. 소개 페이지로 내보내고 다시 로그인하게 한다.
 *
 * 예전에는 이 컴포넌트가 세션을 zustand 스토어로 복사하는 일도 했는데, 읽는 쪽(Sidebar ·
 * SidebarProfile)이 useSession() 을 직접 쓰도록 바꿔서 그 동기화는 없앴다.
 */
function RefreshFailureGuard() {
  const { data: session } = useSession();
  const refreshFailed = session?.error === 'RefreshAccessTokenError';

  useEffect(() => {
    if (refreshFailed) signOut({ callbackUrl: '/' });
  }, [refreshFailed]);

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RefreshFailureGuard />
      {children}
    </SessionProvider>
  );
}
