import NextAuth, { CredentialsSignin } from 'next-auth';
import type { JWT } from '@auth/core/jwt';
import Credentials from 'next-auth/providers/credentials';
import { isAxiosError } from 'axios';
import { publicApi } from '@/lib/api/publicApi';
import type { TokenResponse } from '@/types/auth';

/**
 * JWT는 서명 검증 없이도 payload를 읽을 수 있다(base64url 디코딩).
 * 여기서는 accessToken 만료 시각을 알아내 언제 refresh할지 판단하는 용도로만 쓴다 —
 * 실제 신뢰 검증은 매 요청마다 FastAPI가 서명으로 다시 한다.
 */
function readAccessTokenExpiry(accessToken: string): number {
  const payloadSegment = accessToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf-8')) as { exp: number };
  return payload.exp * 1000;
}

/**
 * 백엔드가 준 로그인 거부 사유를 클라이언트까지 실어 나르는 통로.
 *
 * Auth.js 는 authorize 의 일반 예외를 CallbackRouteError 로 감싸 원문을 지운다.
 * CredentialsSignin 하위 클래스의 code 만 signIn(redirect:false) 응답에 살아남으므로,
 * 계정 잠금(429)의 "N분 후 다시 시도" 같은 조치 가능한 안내는 여기에 싣는다.
 */
class LoginRejected extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

/** FastAPI /api/auth/refresh로 accessToken을 재발급받는다. 실패하면 token.error를 세팅해 클라이언트가 재로그인을 유도하게 한다. */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) throw new Error('refresh token 없음');

    const { data } = await publicApi.post<{ access_token: string }>('/api/auth/refresh', {
      refresh_token: token.refreshToken,
    });

    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: readAccessTokenExpiry(data.access_token),
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

// FastAPI의 refresh token 수명(REFRESH_TOKEN_EXPIRE_DAYS)과 맞춘다 —
// 세션 쿠키가 refresh token보다 오래 살아있어봐야 어차피 자동 갱신에 실패해 로그아웃되므로 의미가 없다.
const REFRESH_TOKEN_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS },
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
          // FastAPI에서 검증 후 access/refresh token + 사용자 정보를 발급받는다.
          const { data } = await publicApi.post<TokenResponse>('/api/auth/login', { email, password });

          return {
            id: String(data.user.id),
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            accessTokenExpires: readAccessTokenExpiry(data.access_token),
          };
        } catch (err) {
          if (isAxiosError(err) && err.response?.status === 401) return null;

          // 계정 잠금(429)의 안내문은 사용자가 조치할 수 있는 정보다 — 예전에는
          // 일반 예외로 던져져 로그인 화면이 전부 "비밀번호 틀림"으로 안내했다.
          if (isAxiosError(err) && err.response?.status === 429) {
            const detail: unknown = (err.response.data as { detail?: unknown } | undefined)?.detail;
            throw new LoginRejected(
              typeof detail === 'string'
                ? detail
                : '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
            );
          }

          // 응답 자체가 없으면 자격 증명 문제가 아니라 백엔드에 도달하지 못한 것이다.
          // Auth.js가 CallbackRouteError로 감싸버리면 원인이 보이지 않으므로 여기서 명시적으로 남긴다.
          if (isAxiosError(err) && !err.response) {
            console.error(
              `[auth] FastAPI 연결 실패 (${err.code}) — baseURL=${publicApi.defaults.baseURL}. ` +
              '백엔드가 실행 중인지, API_URL의 포트가 실제 uvicorn 포트와 같은지 확인하세요.',
            );
          }
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    // 로그인 시점에만 user가 채워지므로 이때 FastAPI 토큰/역할을 JWT에 실어둔다.
    // 프로필 수정 후 useSession().update()가 호출되면 trigger === 'update'로 들어와
    // 변경된 이름/이메일을 토큰에 반영한다.
    // 그 외의 경우(세션 조회 시점마다) accessToken 만료가 임박했으면 자동으로 갱신한다 —
    // 세션 쿠키(최대 30일)와 FastAPI accessToken(60분) 수명 차이를 여기서 메꾼다.
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = user.accessTokenExpires;
        token.role = user.role;
        token.id = user.id;
        return token;
      }

      if (trigger === 'update' && session) {
        if (typeof session.name === 'string') token.name = session.name;
        if (typeof session.email === 'string') token.email = session.email;
        return token;
      }

      // 만료 60초 전까지는 그대로 사용
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires - 60_000) {
        return token;
      }

      return refreshAccessToken(token);
    },
    // 클라이언트(useSession)와 서버(auth())에 노출되는 세션 형태를 구성한다.
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.user.id = token.id ?? '';
      session.user.role = token.role ?? 'user';
      return session;
    },
  },
});
