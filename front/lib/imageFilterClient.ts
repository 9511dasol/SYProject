import type { OutputFormat } from '@/types/imageResize';
import { compressImageIfNeeded } from './imageResizeClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * AI가 조건을 통과시키지 않았을 때 던지는 에러.
 * reason — AI가 반환한 불일치 이유
 * provider — 실제 판별에 사용된 AI 모델명
 */
export class FilterRejectedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly provider: string,
    public readonly suggestions: string[] = [],
  ) {
    super(reason);
    this.name = 'FilterRejectedError';
  }
}

/**
 * 서버에 이미지 + 조건 + 크기를 전송하고,
 * - pass=true  → 리사이즈된 Blob 즉시 다운로드, { reason, provider } 반환
 * - pass=false → FilterRejectedError throw
 */
export async function filterAndResize(
  file: File,
  condition: string,
  width: number,
  height: number,
  format: OutputFormat,
  onCompress?: () => void,
  onAnalyze?: () => void,
): Promise<{ reason: string; provider: string }> {
  // 1. 클라이언트 사전 압축 (10MB↑)
  onCompress?.();
  const compressed = await compressImageIfNeeded(file);

  // 2. 서버 요청
  onAnalyze?.();
  const form = new FormData();
  form.append('file', compressed);
  form.append('condition', condition.trim());
  form.append('width', width > 0 ? String(width) : '');
  form.append('height', height > 0 ? String(height) : '');
  form.append('format', format);

  const res = await fetch(`${API_BASE}/api/image-filter/analyze-and-resize`, {
    method: 'POST',
    body: form,
  });

  // 3. 실패 응답 처리
  if (!res.ok) {
    let detail = `서버 오류: ${res.status}`;
    let reason = '';
    let provider = '';
    try {
      const json = await res.json();
      detail   = json.detail   ?? detail;
      reason   = json.reason   ?? '';
      provider = json.provider ?? '';
    } catch {
      // JSON 파싱 실패 무시
    }
    if (res.status === 400 && reason) {
      const suggestions: string[] = Array.isArray(json.suggestions) ? json.suggestions : [];
      throw new FilterRejectedError(reason, provider, suggestions);
    }
    throw new Error(detail);
  }

  // 4. 성공: Blob 다운로드
  const blob     = await res.blob();
  const aiReason   = res.headers.get('X-AI-Reason')   ?? '조건을 충족하였습니다.';
  const aiProvider = res.headers.get('X-AI-Provider') ?? '';

  const contentDisposition = res.headers.get('Content-Disposition') ?? '';
  const match = contentDisposition.match(/filename[^;=\n]*=\s*(?:UTF-8''|"?)([^";\n]*)"?/i);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : `filtered_${file.name}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return { reason: aiReason, provider: aiProvider };
}
