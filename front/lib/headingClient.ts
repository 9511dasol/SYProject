import type { HeadingItem } from '@/types/heading';
import { compressImageIfNeeded } from './imageResizeClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * 이미지를 서버에 전송해 플랫폼별 헤딩 문구 배열을 반환합니다.
 * 10MB 초과 이미지는 클라이언트에서 Canvas 압축 후 전송합니다.
 */
export async function fetchHeadings(
  file: File,
  onCompress?: () => void,
  onAnalyze?: () => void,
): Promise<HeadingItem[]> {
  onCompress?.();
  const compressed = await compressImageIfNeeded(file);

  onAnalyze?.();
  const form = new FormData();
  form.append('file', compressed);

  const res = await fetch(`${API_BASE}/api/heading/suggest`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let detail = `서버 오류: ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const data = await res.json();
  return data.headings as HeadingItem[];
}
