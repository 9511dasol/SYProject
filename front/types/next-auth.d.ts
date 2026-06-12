import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/types/auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: UserRole;
    accessToken?: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    role?: UserRole;
    accessToken?: string;
  }
}
