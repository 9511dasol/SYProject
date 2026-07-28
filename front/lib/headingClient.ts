import type { HeadingHistoryResponse, HeadingSuggestionRecord } from '@/types/heading';
import { authFetch } from '@/lib/api/authFetch';
import { compressImageIfNeeded } from './imageResizeClient';

async function readError(res: Response, fallback: string): Promise<string> {
  let detail = fallback;
  try {
    const json = await res.json();
    detail = json.detail ?? json.message ?? detail;
  } catch { /* ignore */ }
  return detail;
}

/**
 * 이미지를 서버에 전송해 플랫폼별 헤딩 문구를 생성하고, 저장된 기록(히스토리 항목)을 반환합니다.
 * 생성 결과는 서버 DB에 사용자별로 저장되므로 이후 히스토리에서 다시 볼 수 있습니다.
 * 10MB 초과 이미지는 클라이언트에서 Canvas 압축 후 전송합니다.
 */
export async function fetchHeadings(
  file: File,
  onCompress?: () => void,
  onAnalyze?: () => void,
): Promise<HeadingSuggestionRecord> {
  onCompress?.();
  const compressed = await compressImageIfNeeded(file);

  onAnalyze?.();
  const form = new FormData();
  form.append('file', compressed);

  const res = await authFetch('/api/heading/suggest', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(await readError(res, `서버 오류: ${res.status}`));
  }

  return (await res.json()) as HeadingSuggestionRecord;
}

/**
 * 히스토리를 페이지 단위로 가져옵니다 (전체 건수 포함).
 * 오래된 기록까지 이어서 볼 수 있어야 해서 offset/total 이 필요합니다.
 */
export async function fetchHeadingHistoryPage(
  limit: number,
  offset: number,
): Promise<HeadingHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await authFetch(`/api/heading/history?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(await readError(res, `기록을 불러오지 못했습니다 (${res.status})`));
  }
  return (await res.json()) as HeadingHistoryResponse;
}

/** 문구 생성 기록 한 건을 삭제합니다. */
export async function deleteHeadingSuggestion(id: number): Promise<void> {
  const res = await authFetch(`/api/heading/history/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    throw new Error(await readError(res, `삭제에 실패했습니다 (${res.status})`));
  }
}
