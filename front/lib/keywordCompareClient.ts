import axios, { isAxiosError } from 'axios';
import type { CompareResult } from '@/types/keywordCompare';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
});

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    return err.response?.data?.detail ?? fallback;
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
