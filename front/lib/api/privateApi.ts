import axios from 'axios';
import { auth } from '@/auth';

/**
 * 인증이 필요한 FastAPI 엔드포인트 호출용 인스턴스.
 * Route Handler / Server Component 등 서버 사이드에서만 사용한다.
 * 요청 직전에 NextAuth 세션의 accessToken을 Authorization 헤더에 주입한다.
 */
export const privateApi = axios.create({
  // publicApi와 동일하게 IPv4 명시 (localhost → ::1 해석으로 인한 연결 거부 방지)
  baseURL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,  // 엑셀 업로드·AI 호출 등 오래 걸리는 요청이 있어 publicApi보다 길게
});

privateApi.interceptors.request.use(async (config) => {
  const session = await auth();

  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }

  return config;
});
