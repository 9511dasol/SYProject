import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { isAxiosError } from 'axios';
import { publicApi } from '@/lib/api/publicApi';
import type { TokenResponse } from '@/types/auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string') return null;

        try {
          // FastAPI에서 검증 후 access token + 사용자 정보를 발급받는다.
          const { data } = await publicApi.post<TokenResponse>('/api/auth/login', { email, password });

          return {
            id: String(data.user.id),
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            accessToken: data.access_token,
          };
        } catch (err) {
          if (isAxiosError(err) && err.response?.status === 401) return null;
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    // 로그인 시점에만 user가 채워지므로 이때 FastAPI 토큰/역할을 JWT에 실어둔다.
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    // 클라이언트(useSession)와 서버(auth())에 노출되는 세션 형태를 구성한다.
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.id = token.id ?? '';
      session.user.role = token.role ?? 'user';
      return session;
    },
  },
});
