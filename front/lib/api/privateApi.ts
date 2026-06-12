import axios from 'axios';
import { auth } from '@/auth';

/**
 * 인증이 필요한 FastAPI 엔드포인트 호출용 인스턴스.
 * Route Handler / Server Component 등 서버 사이드에서만 사용한다.
 * 요청 직전에 NextAuth 세션의 accessToken을 Authorization 헤더에 주입한다.
 */
export const privateApi = axios.create({
  baseURL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

privateApi.interceptors.request.use(async (config) => {
  const session = await auth();

  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }

  return config;
});
