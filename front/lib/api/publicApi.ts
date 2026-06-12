import axios from 'axios';

/**
 * 인증이 필요 없는 FastAPI 엔드포인트 호출용 인스턴스.
 * NextAuth authorize()나 회원가입 Route Handler처럼 서버 사이드에서만 사용한다.
 */
export const publicApi = axios.create({
  baseURL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});
