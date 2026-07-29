import axios from 'axios';
import { signOut } from 'next-auth/react';

/**
 * 브라우저에서 BFF Route Handler(/api/**)를 호출할 때 쓰는 공용 axios 인스턴스.
 * accessToken은 서버(auth.ts의 jwt 콜백)에서 자동 갱신되지만, 계정 비활성화 등
 * 갱신으로 해결되지 않는 사유로 401이 오면 세션을 정리하고 소개 페이지('/')로 보낸다.
 */
export const browserApi = axios.create();

browserApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      signOut({ callbackUrl: '/' });
    }
    return Promise.reject(error);
  },
);
