import type { MediaPreset, OutputFormat } from '@/types/imageResize';
import { authFetch } from '@/lib/api/authFetch';

/** 매체 규격 프리셋 목록 (서버가 단일 출처) */
export async function fetchMediaPresets(): Promise<MediaPreset[]> {
  const res = await authFetch('/api/image-resize/presets');
  if (!res.ok) throw new Error(`규격 목록을 불러오지 못했습니다 (${res.status})`);
  return (await res.json()) as MediaPreset[];
}

/** 선택한 매체 규격들로 일괄 변환해 zip 을 다운로드한다 (AI 미사용·무과금) */
export async function batchResizeToZip(
  file: File,
  presetKeys: string[],
  format: OutputFormat,
): Promise<void> {
  const compressed = await compressImageIfNeeded(file);
  const form = new FormData();
  form.append('file', compressed);
  form.append('presets', presetKeys.join(','));
  form.append('format', format);

  const res = await authFetch('/api/image-resize/batch', { method: 'POST', body: form });
  if (!res.ok) {
    let detail = `서버 오류: ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? json.message ?? detail;
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const contentDisposition = res.headers.get('Content-Disposition') ?? '';
  const match = contentDisposition.match(/filename[^;=\n]*=\s*(?:UTF-8''|"?)([^";\n]*)"?/i);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : 'media_sizes.zip';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** 10MB 초과 시 Canvas로 압축 (품질 0.85, 원본 해상도 유지) */
const COMPRESS_THRESHOLD = 10 * 1024 * 1024;

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  );
  if (!blob) return file;

  const stem = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' });
}

export async function resizeImage(
  file: File,
  width: number,
  height: number,
  format: OutputFormat,
  useAiUpscale: boolean = false
): Promise<{ aiUpscaleUsed: boolean }> {
  const form = new FormData();
  form.append('file', file);
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('format', format);
  form.append('use_ai_upscale', String(useAiUpscale));

  const res = await authFetch('/api/image-resize/resize', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let detail = `서버 오류: ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? json.message ?? detail;
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const contentDisposition = res.headers.get('Content-Disposition') ?? '';
  const match = contentDisposition.match(/filename[^;=\n]*=\s*(?:UTF-8''|"?)([^";\n]*)"?/i);
  const filename = match?.[1] ?? `resized_${file.name}`;
  const aiUpscaleUsed = res.headers.get('X-AI-Upscale-Used') === 'true';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = decodeURIComponent(filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return { aiUpscaleUsed };
}
