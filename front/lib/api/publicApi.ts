import axios from 'axios';

/**
 * 인증이 필요 없는 FastAPI 엔드포인트 호출용 인스턴스.
 * NextAuth authorize()나 회원가입 Route Handler처럼 서버 사이드에서만 사용한다.
 */
export const publicApi = axios.create({
  // 'localhost'는 Node가 ::1(IPv6)로 먼저 해석할 수 있는데 uvicorn은 127.0.0.1에만 바인딩하므로
  // 기본값은 IPv4를 명시한다 (구버전 Node에서 ECONNREFUSED가 나던 원인)
  baseURL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,  // 백엔드가 응답하지 않을 때 로그인이 무한 대기하지 않도록
});
