import type { HeadingHistoryResponse, HeadingSuggestionRecord } from '@/types/heading';
import { authFetch, NO_TIMEOUT } from '@/lib/api/authFetch';
import { extractResponseError } from '@/lib/api/responseError';
import { compressImageIfNeeded } from './imageResizeClient';

/**
 * 이미지를 서버에 전송해 플랫폼별 헤딩 문구를 생성하고, 저장된 기록(히스토리 항목)을 반환합니다.
 * 생성 결과는 서버 DB에 사용자별로 저장되므로 이후 히스토리에서 다시 볼 수 있습니다.
 * 10MB 초과 이미지는 클라이언트에서 Canvas 압축 후 전송합니다.
 */
export async function fetchHeadings(
  file: File,
  onCompress?: () => void,
  onAnalyze?: () => void,
  signal?: AbortSignal,
): Promise<HeadingSuggestionRecord> {
  onCompress?.();
  const compressed = await compressImageIfNeeded(file);

  onAnalyze?.();
  const form = new FormData();
  form.append('file', compressed);

  const res = await authFetch('/api/heading/suggest', {
    method: 'POST',
    body: form,
    // Vision 호출이라 수십 초가 정상 — 끊지 않고 사용자 취소에 맡긴다.
    timeoutMs: NO_TIMEOUT,
    signal,
  });

  if (!res.ok) {
    throw new Error(await extractResponseError(res));
  }

  return (await res.json()) as HeadingSuggestionRecord;
}

/**
 * 히스토리를 페이지 단위로 가져옵니다 (전체 건수 포함).
 * 오래된 기록까지 이어서 볼 수 있어야 해서 offset/total 이 필요합니다.
 * q 를 주면 서버가 파일명·문구 본문에서 검색합니다 — 화면에 불러온 기록만
 * 거르는 방식으로는 오래된 기록을 찾을 수 없었습니다.
 */
export async function fetchHeadingHistoryPage(
  limit: number,
  offset: number,
  q?: string,
): Promise<HeadingHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set('q', q);
  const res = await authFetch(`/api/heading/history?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(await extractResponseError(res, `기록을 불러오지 못했습니다 (${res.status})`));
  }
  return (await res.json()) as HeadingHistoryResponse;
}

/** 문구 생성 기록 한 건을 삭제합니다. */
export async function deleteHeadingSuggestion(id: number): Promise<void> {
  const res = await authFetch(`/api/heading/history/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    throw new Error(await extractResponseError(res, `삭제에 실패했습니다 (${res.status})`));
  }
}
