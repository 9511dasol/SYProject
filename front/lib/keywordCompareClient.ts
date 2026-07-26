import { isAxiosError } from 'axios';
import { browserApi as api } from '@/lib/api/browserApi';
import type { CompareResult } from '@/types/keywordCompare';

// BFF Route Handler(/api/keyword-compare/*)를 거쳐 FastAPI로 전달된다.
// 같은 오리진이라 baseURL이 필요 없고, 인증은 Route Handler가 세션으로 처리한다.

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    return err.response?.data?.message ?? err.response?.data?.detail ?? fallback;
  }
  return fallback;
}

export async function parseKeywordCompare(file: File): Promise<CompareResult> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const { data } = await api.post<CompareResult>('/api/keyword-compare/parse', formData);
    return data;
  } catch (err) {
    throw new Error(extractError(err, '파일 파싱에 실패했습니다.'));
  }
}
