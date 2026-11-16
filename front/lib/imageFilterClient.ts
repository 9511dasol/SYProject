import type { OutputFormat } from '@/types/imageResize';
import type { BackgroundVariant, ImageElement } from '@/types/imageFilter';
import { authFetch, NO_TIMEOUT } from '@/lib/api/authFetch';
import { downloadResponse } from '@/lib/api/download';
import { throwResponseError } from '@/lib/api/responseError';
import { compressImageIfNeeded } from './imageResizeClient';

// AI 이미지 작업은 수십 초가 정상이라 공용 타임아웃(30초)을 적용하면 안 된다.
// 대신 호출부가 넘긴 signal 로 사용자가 직접 끊을 수 있게 한다.

/** 피사체는 유지하고 배경만 바꾼 시안 여러 장을 생성한다 (이미지 생성 모델 — 수십 초 소요). */
export async function suggestBackgrounds(
  file: File,
  signal?: AbortSignal,
): Promise<BackgroundVariant[]> {
  const compressed = await compressImageIfNeeded(file);
  const form = new FormData();
  form.append('file', compressed);

  const res = await authFetch('/api/image-filter/backgrounds', {
    method: 'POST',
    body: form,
    timeoutMs: NO_TIMEOUT,
    signal,
  });
  if (!res.ok) await throwResponseError(res);

  const data = (await res.json()) as { variants: BackgroundVariant[] };
  return data.variants;
}

/** 이미지 속 구성 요소(텍스트·로고·제품 등)를 bounding box 와 함께 분석한다. */
export async function analyzeElements(
  file: File,
  signal?: AbortSignal,
): Promise<ImageElement[]> {
  const compressed = await compressImageIfNeeded(file);
  const form = new FormData();
  form.append('file', compressed);

  const res = await authFetch('/api/image-filter/analyze', {
    method: 'POST',
    body: form,
    timeoutMs: NO_TIMEOUT,
    signal,
  });

  if (!res.ok) await throwResponseError(res);

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
  signal?: AbortSignal,
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
    timeoutMs: NO_TIMEOUT,
    signal,
  });

  // 3. 실패 응답 처리
  if (!res.ok) await throwResponseError(res);

  // 4. 성공: Blob 다운로드
  const aiProvider = res.headers.get('X-AI-Provider') ?? '';
  await downloadResponse(res, `edited_${file.name}`);

  return { provider: aiProvider };
}
