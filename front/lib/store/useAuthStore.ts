import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types/auth';

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
}

/**
 * 화면에 보여줄 사용자 정보(zustand persist)만 보관한다.
 * accessToken은 NextAuth의 httpOnly 쿠키에만 저장되며 이 store에는 절대 두지 않는다.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: 'auth-storage',
    },
  ),
);
