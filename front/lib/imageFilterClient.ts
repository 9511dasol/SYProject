import type { OutputFormat } from '@/types/imageResize';
import type { BackgroundVariant, ImageElement } from '@/types/imageFilter';
import { authFetch } from '@/lib/api/authFetch';
import { compressImageIfNeeded } from './imageResizeClient';

async function throwResponseError(res: Response): Promise<never> {
  let detail = `서버 오류: ${res.status}`;
  try {
    const json = await res.json();
    detail = json.detail ?? json.message ?? detail;
  } catch {
    // JSON 파싱 실패 무시
  }
  throw new Error(detail);
}

/** 피사체는 유지하고 배경만 바꾼 시안 여러 장을 생성한다 (이미지 생성 모델 — 수십 초 소요). */
export async function suggestBackgrounds(file: File): Promise<BackgroundVariant[]> {
  const compressed = await compressImageIfNeeded(file);
  const form = new FormData();
  form.append('file', compressed);

  const res = await authFetch('/api/image-filter/backgrounds', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) await throwResponseError(res);

  const data = (await res.json()) as { variants: BackgroundVariant[] };
  return data.variants;
}

/** 이미지 속 구성 요소(텍스트·로고·제품 등)를 bounding box 와 함께 분석한다. */
export async function analyzeElements(file: File): Promise<ImageElement[]> {
  const compressed = await compressImageIfNeeded(file);
  const form = new FormData();
  form.append('file', compressed);

  const res = await authFetch('/api/image-filter/analyze', {
    method: 'POST',
    body: form,
  });

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

  const data = (await res.json()) as { elements: ImageElement[] };
  return data.elements;
}

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
