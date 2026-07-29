'use client';

import { useEffect } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import { useAuthStore } from '@/lib/store/useAuthStore';

/** NextAuth 세션 변화를 zustand store(useAuthStore)에 동기화한다. */
function AuthStoreSync() {
  const { data: session, status } = useSession();
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);

  useEffect(() => {
    // accessToken 자동 갱신(refresh token 만료 등으로)이 실패한 경우 —
    // 세션은 남아있지만 더 이상 API를 호출할 수 없으므로 바로 로그아웃시켜 소개 페이지로 내보낸다.
    if (session?.error === 'RefreshAccessTokenError') {
      clearUser();
      signOut({ callbackUrl: '/' });
      return;
    }

    if (status === 'authenticated' && session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
        role: session.user.role,
        image: session.user.image,
      });
    } else if (status === 'unauthenticated') {
      clearUser();
    }
  }, [session, status, setUser, clearUser]);

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthStoreSync />
      {children}
    </SessionProvider>
  );
}
