import type { OutputFormat } from '@/types/imageResize';
import type { BackgroundStyle, BackgroundVariant, ImageElement } from '@/types/imageFilter';
import { authFetch, NO_TIMEOUT } from '@/lib/api/authFetch';
import { filenameFromDisposition } from '@/lib/api/download';
import { throwResponseError } from '@/lib/api/responseError';
import { compressImageIfNeeded, downscaleForAnalysis } from './imageResizeClient';

// AI 이미지 작업은 수십 초가 정상이라 공용 타임아웃(30초)을 적용하면 안 된다.
// 대신 호출부가 넘긴 signal 로 사용자가 직접 끊을 수 있게 한다.

/** 고를 수 있는 배경 스타일 목록 (서버가 단일 출처) */
export async function fetchBackgroundStyles(): Promise<BackgroundStyle[]> {
  const res = await authFetch('/api/image-filter/background-styles');
  if (!res.ok) await throwResponseError(res);
  return (await res.json()) as BackgroundStyle[];
}

/**
 * 피사체는 유지하고 배경만 바꾼 시안을 생성한다 (이미지 생성 모델 — 수십 초 소요).
 * 스타일 하나당 생성 1회라 고른 수가 그대로 비용이다.
 */
export async function suggestBackgrounds(
  file: File,
  styles: string[],
  signal?: AbortSignal,
): Promise<BackgroundVariant[]> {
  const compressed = await compressImageIfNeeded(file);
  const form = new FormData();
  form.append('file', compressed);
  form.append('styles', styles.join(','));

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

/**
 * 이미지 속 구성 요소(텍스트·로고·제품 등)를 bounding box 와 함께 분석한다.
 *
 * 결과가 0~1 비율 좌표라 원본 해상도가 필요 없다 — 축소본을 보내 입력 토큰을 아낀다.
 */
export async function analyzeElements(
  file: File,
  signal?: AbortSignal,
): Promise<ImageElement[]> {
  const compressed = await downscaleForAnalysis(file);
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
 * AI가 프롬프트대로 수정한 이미지를 Blob으로 돌려받는다.
 * 미리보기·다운로드 시점은 호출부(대화형 UI)가 결정한다.
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
): Promise<{ provider: string; blob: Blob; filename: string }> {
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

  // 4. 성공: Blob 반환 (파일명은 응답 헤더 우선)
  const aiProvider = res.headers.get('X-AI-Provider') ?? '';
  const blob = await res.blob();
  const filename = filenameFromDisposition(res, `edited_${file.name}`);

  return { provider: aiProvider, blob, filename };
}
