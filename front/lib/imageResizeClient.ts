import type { MediaPreset, OutputFormat } from '@/types/imageResize';
import { authFetch, NO_TIMEOUT } from '@/lib/api/authFetch';
import { downloadResponse } from '@/lib/api/download';
import { throwResponseError } from '@/lib/api/responseError';

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

  // 프리셋 수만큼 변환 + zip 압축이라 큰 이미지에서는 기본 상한을 넘길 수 있다.
  const res = await authFetch('/api/image-resize/batch', {
    method: 'POST',
    body: form,
    timeoutMs: NO_TIMEOUT,
  });
  if (!res.ok) await throwResponseError(res);

  await downloadResponse(res, 'media_sizes.zip');
}

/** 10MB 초과 시 Canvas로 압축 (품질 0.85, 원본 해상도 유지) */
const COMPRESS_THRESHOLD = 10 * 1024 * 1024;

// 같은 File 은 한 번만 압축한다 — 이미지 정제 화면은 한 파일로 전송·분석·배경
// 시안을 반복 호출하는데, 호출마다 디코드+재인코딩하면 매번 수 초를 다시 낸다.
const compressCache = new WeakMap<File, Promise<File>>();

export function compressImageIfNeeded(file: File): Promise<File> {
  let cached = compressCache.get(file);
  if (!cached) {
    cached = compressFile(file);
    // 실패가 캐시에 남으면 이후 호출이 전부 같은 실패를 돌려받는다
    cached.catch(() => compressCache.delete(file));
    compressCache.set(file, cached);
  }
  return cached;
}

async function compressFile(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file;
  return redraw(file, 1);
}

/**
 * 분석용 축소본 — 장변을 ANALYSIS_MAX_EDGE 로 줄인다.
 *
 * 요소 분석은 결과가 0~1 비율 좌표라 원본 해상도가 필요 없는데, 원본을 그대로
 * 올리면 입력 토큰이 그 크기만큼 붙는다(호출당 1,300 토큰대). 화면에 겹쳐 그릴
 * 박스를 찾는 데는 1024px 이면 충분하다.
 */
const ANALYSIS_MAX_EDGE = 1024;

const analysisCache = new WeakMap<File, Promise<File>>();

export function downscaleForAnalysis(file: File): Promise<File> {
  let cached = analysisCache.get(file);
  if (!cached) {
    cached = shrinkToMaxEdge(file, ANALYSIS_MAX_EDGE);
    cached.catch(() => analysisCache.delete(file));
    analysisCache.set(file, cached);
  }
  return cached;
}

async function shrinkToMaxEdge(file: File, maxEdge: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) {
    bitmap.close();
    return file; // 이미 작으면 다시 인코딩해 봤자 화질만 깎인다
  }
  return redraw(file, maxEdge / longest, bitmap);
}

/** 배율대로 캔버스에 다시 그려 JPEG 로 인코딩한다. bitmap 을 주면 그걸 쓴다. */
async function redraw(file: File, scale: number, source?: ImageBitmap): Promise<File> {
  const bitmap = source ?? (await createImageBitmap(file));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // JPEG 는 알파 채널이 없어 투명 영역이 검정으로 깔린다. 서버의
  // image_util.flatten_to_rgb 와 같은 규칙(흰색 합성)을 여기서도 지켜야
  // 투명 PNG 가 압축/축소 경로를 타도 서버와 같은 결과가 나온다 —
  // 예전에는 여기서 알파를 먼저 파괴해 서버의 흰색 합성이 무력화됐다.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
  useAiUpscale: boolean = false,
  signal?: AbortSignal,
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
    // AI 업스케일을 켜면 수십 초가 걸린다 — 끊지 않고 사용자 취소에 맡긴다.
    timeoutMs: NO_TIMEOUT,
    signal,
  });

  if (!res.ok) await throwResponseError(res);

  const aiUpscaleUsed = res.headers.get('X-AI-Upscale-Used') === 'true';
  await downloadResponse(res, `resized_${file.name}`);

  return { aiUpscaleUsed };
}
