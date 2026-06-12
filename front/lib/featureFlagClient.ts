import axios, { isAxiosError } from 'axios';
import type { FeatureFlags } from '@/types/featureFlags';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
});

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    return err.response?.data?.detail ?? fallback;
  }
  return fallback;
}

/** 앱 시작 시 호출하는 공개 엔드포인트 — 인증 불필요 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    const { data } = await api.get<FeatureFlags>('/api/settings/flags');
    return data;
  } catch (err) {
    throw new Error(extractError(err, `기능 플래그 조회 실패: ${(err as Error).message}`));
  }
}
