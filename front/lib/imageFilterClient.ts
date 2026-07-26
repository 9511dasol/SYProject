import type { OutputFormat } from '@/types/imageResize';
import { authFetch } from '@/lib/api/authFetch';
import { compressImageIfNeeded } from './imageResizeClient';

/**
 * 서버에 이미지 + 편집 프롬프트 + 크기를 전송하고,
 * AI가 프롬프트대로 수정한 이미지를 Blob으로 즉시 다운로드한다.
 */
export async function editAndResize(
  file: File,
  prompt: string,
  width: number,
  height: number,
  format: OutputFormat,
  onCompress?: () => void,
  onEdit?: () => void,
): Promise<{ provider: string }> {
  // 1. 클라이언트 사전 압축 (10MB↑)
  onCompress?.();
  const compressed = await compressImageIfNeeded(file);

  // 2. 서버 요청
  onEdit?.();
  const form = new FormData();
  form.append('file', compressed);
  form.append('prompt', prompt.trim());
  form.append('width', width > 0 ? String(width) : '');
  form.append('height', height > 0 ? String(height) : '');
  form.append('format', format);

  const res = await authFetch('/api/image-filter/edit', {
    method: 'POST',
    body: form,
  });

  // 3. 실패 응답 처리
  if (!res.ok) {
    let detail = `서버 오류: ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? json.message ?? detail;
    } catch {
      // JSON 파싱 실패 무시
    }
    throw new Error(detail);
  }

  // 4. 성공: Blob 다운로드
  const blob = await res.blob();
  const aiProvider = res.headers.get('X-AI-Provider') ?? '';

  const contentDisposition = res.headers.get('Content-Disposition') ?? '';
  const match = contentDisposition.match(/filename[^;=\n]*=\s*(?:UTF-8''|"?)([^";\n]*)"?/i);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : `edited_${file.name}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return { provider: aiProvider };
}
