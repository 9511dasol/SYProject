import type { OutputFormat } from '@/types/imageResize';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

  const res = await fetch(`${API_BASE}/api/image-resize/resize`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let detail = `서버 오류: ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? detail;
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
