import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/types/auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    /** accessToken 자동 갱신(refresh)이 실패했을 때만 채워진다 — 클라이언트에서 이 값을 보면 강제 로그아웃해야 한다. */
    error?: 'RefreshAccessTokenError';
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: UserRole;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    role?: UserRole;
    accessToken?: string;
    refreshToken?: string;
    /** accessToken 만료 시각 (ms epoch) */
    accessTokenExpires?: number;
    error?: 'RefreshAccessTokenError';
  }
}
