'use client';

import { useState, useCallback, useEffect } from 'react';
import DropZone from '@/components/image-resize/DropZone';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import MediaPresetBatch from '@/components/image-resize/MediaPresetBatch';
import Button from '@/components/ui/Button';
import type { ResizeFormState, ResizeResult } from '@/types/imageResize';
import { useAspectRatioInputs } from '@/hooks/useAspectRatioInputs';
import { useImageUpload } from '@/hooks/useImageUpload';
import { triggerDownload } from '@/lib/api/download';
import { compressImageIfNeeded, resizeImage } from '@/lib/imageResizeClient';

const INITIAL_FORM: ResizeFormState = {
  targetWidth: '',
  targetHeight: '',
  keepAspectRatio: true,
  outputFormat: 'jpeg',
  useAiUpscale: false,
};

type ProcessingState = 'idle' | 'compressing' | 'resizing';

export default function ImageResizeClient() {
  const [form, setForm] = useState<ResizeFormState>(INITIAL_FORM);
  const [processing, setProcessing] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  /* 변환 결과 — 미리보기·용량 비교·재다운로드용으로 화면에 남긴다 */
  const [result, setResult] = useState<{ data: ResizeResult; url: string } | null>(null);

  const isProcessing = processing !== 'idle';

  // 이전 결과가 교체되거나 화면을 떠날 때 objectURL 을 해제한다
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  /* ── 파일 선택 (업로드·미리보기·치수 측정은 공용 훅) ────────── */
  const {
    file,
    previewUrl,
    dimensions: originalDimensions,
    select,
    clear,
  } = useImageUpload((dims) =>
    setForm((prev) => ({
      ...prev,
      targetWidth: String(dims.width),
      targetHeight: String(dims.height),
    })),
  );

  const handleFileSelect = useCallback(
    (f: File) => {
      setError(null);
      setResult(null);
      setForm(INITIAL_FORM);
      select(f);
    },
    [select],
  );

  /* ── 초기화 ─────────────────────────────────────────────────── */
  const handleClear = useCallback(() => {
    clear();
    setForm(INITIAL_FORM);
    setError(null);
    setResult(null);
  }, [clear]);

  /* ── 가로·세로 변경 (비율 유지 계산은 공용 훅) ──────────────── */
  const { onWidthChange: handleWidthChange, onHeightChange: handleHeightChange } =
    useAspectRatioInputs(originalDimensions, setForm);

  /* ── 리사이즈 실행 ──────────────────────────────────────────── */
  const handleResize = async () => {
    if (!file) return;
    const w = parseInt(form.targetWidth, 10);
    const h = parseInt(form.targetHeight, 10);
    if (!w || !h || w < 1 || h < 1) {
      setError('올바른 가로·세로 크기를 입력해주세요.');
      return;
    }
    setError(null);
    setResult(null);

    try {
      setProcessing('compressing');
      const compressed = await compressImageIfNeeded(file);

      setProcessing('resizing');
      const data = await resizeImage(compressed, w, h, form.outputFormat, useAiUpscale);

      triggerDownload(data.blob, data.filename);
      setResult({ data, url: URL.createObjectURL(data.blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setProcessing('idle');
    }
  };

  const isUpscaling =
    !!originalDimensions &&
    Number(form.targetWidth) * Number(form.targetHeight) >
      originalDimensions.width * originalDimensions.height;

  /* ── 축소/동일 비율에서는 AI 업스케일이 의미가 없으므로 꺼진 것으로 취급한다 ──
     이펙트로 form을 되돌리면 렌더가 한 번 더 도는 데다, 사용자가 크기를 다시
     확대 비율로 바꿨을 때 켜뒀던 선택이 사라진다. 파생값으로 두면 둘 다 해결된다. */
  const useAiUpscale = isUpscaling && form.useAiUpscale;

  /* 언마운트 시 objectURL 해제는 useImageUpload 가 맡는다 */

  const canResize = !!file && !!form.targetWidth && !!form.targetHeight && !isProcessing;

  const processingLabel =
    processing === 'compressing'
      ? '압축 중...'
      : processing === 'resizing'
      ? useAiUpscale
        ? 'AI 업스케일 중...'
        : '리사이징 중...'
      : '리사이즈 & 다운로드';

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-bg via-surface to-violet-50/30 dark:to-violet-950/20 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* 헤더 */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-violet-500 dark:text-violet-400 uppercase bg-violet-50 dark:bg-violet-950/50 rounded-full px-4 py-1.5 ring-1 ring-violet-100 dark:ring-violet-900">
            <i className="bx bx-crop text-sm" />
            Image Resizer
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">이미지 리사이저</h1>
          <p className="text-sm text-fg-muted">
            JPEG · PNG · WebP 이미지를 원하는 크기로 무료 변환 · 서버에 저장되지 않습니다
          </p>
        </header>

        {/* 메인 카드 */}
        <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden">
          {/* 섹션 1: 업로드 */}
          <section className="p-6">
            <SectionLabel number={1} label="이미지 업로드" />
            <div className="mt-3">
              <DropZone
                file={file}
                previewUrl={previewUrl}
                originalDimensions={originalDimensions}
                onFileSelect={handleFileSelect}
                onClear={handleClear}
                disabled={isProcessing}
              />
            </div>
          </section>

          {/* 섹션 2·3: 파일 선택 후만 표시 */}
          {file && originalDimensions && (
            <>
              <Divider />

              {/* 섹션 2: 크기 설정 */}
              <section className="p-6">
                <SectionLabel number={2} label="크기 설정" />
                <div className="mt-3">
                  <DimensionInputs
                    targetWidth={form.targetWidth}
                    targetHeight={form.targetHeight}
                    keepAspectRatio={form.keepAspectRatio}
                    originalDimensions={originalDimensions}
                    onWidthChange={handleWidthChange}
                    onHeightChange={handleHeightChange}
                    onToggleAspectRatio={() =>
                      setForm((prev) => ({ ...prev, keepAspectRatio: !prev.keepAspectRatio }))
                    }
                    disabled={isProcessing}
                  />
                </div>
              </section>

              <Divider />

              {/* 섹션 3: 출력 포맷 */}
              <section className="p-6">
                <SectionLabel number={3} label="출력 포맷" />
                <div className="mt-3">
                  <FormatSelector
                    value={form.outputFormat}
                    onChange={(fmt) => setForm((prev) => ({ ...prev, outputFormat: fmt }))}
                    disabled={isProcessing}
                  />
                </div>
              </section>

              {/* 섹션 4: AI 업스케일 (확대 시에만 표시) */}
              {isUpscaling && (
                <>
                  <Divider />
                  <section className="p-6">
                    <SectionLabel number={4} label="AI 업스케일" />
                    <label className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface-2/50 px-4 py-3.5 cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50">
                      <input
                        type="checkbox"
                        checked={useAiUpscale}
                        onChange={(e) => setForm((prev) => ({ ...prev, useAiUpscale: e.target.checked }))}
                        disabled={isProcessing}
                        className="mt-0.5 h-4 w-4 rounded border-border text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-sm text-fg-muted">
                        <span className="font-medium text-fg">AI로 디테일 보강</span>
                        <br />
                        원본보다 큰 사이즈로 확대합니다. 일반 리사이즈는 흐려질 수 있어 AI 모델이 디테일을
                        보강한 뒤 리사이즈합니다. 처리 시간이 조금 더 걸릴 수 있어요.
                      </span>
                    </label>
                  </section>
                </>
              )}
            </>
          )}

          {/* 상태 메시지 + 실행 버튼 */}
          {(error || file) && (
            <>
              <Divider />
              <div className="p-6 space-y-4">
                {error && (
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
                    <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                {file && (
                  <Button
                    tone="violet"
                    className="w-full"
                    onClick={handleResize}
                    isLoading={isProcessing}
                    disabled={!canResize}
                  >
                    {!isProcessing && <i className="bx bx-download text-lg" />}
                    {processingLabel}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* 변환 결과 — 작업의 결과물이 화면에 남아야 "뭘 만들었는지" 보인다 */}
          {result && file && previewUrl && originalDimensions && (
            <>
              <Divider />
              <section className="p-6 bg-emerald-50/40 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2">
                  <i className="bx bx-check-circle text-lg text-emerald-500" />
                  <span className="text-sm font-semibold text-fg-body">변환 완료</span>
                  {result.data.aiUpscaleUsed && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 tracking-wide">
                      AI 업스케일
                    </span>
                  )}
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  다운로드가 시작되었습니다. 저장이 안 됐다면 아래에서 다시 받을 수 있어요.
                </p>

                <div className="mt-4 flex items-center justify-center gap-3 sm:gap-5">
                  <ResultThumb
                    src={previewUrl}
                    alt="원본 이미지"
                    label="원본"
                    width={originalDimensions.width}
                    height={originalDimensions.height}
                    bytes={file.size}
                  />
                  <i className="bx bx-right-arrow-alt text-2xl text-fg-subtle shrink-0" />
                  <ResultThumb
                    src={result.url}
                    alt="변환된 이미지"
                    label="결과"
                    width={result.data.width}
                    height={result.data.height}
                    bytes={result.data.blob.size}
                    deltaPercent={Math.round((1 - result.data.blob.size / file.size) * 100)}
                    highlighted
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => triggerDownload(result.data.blob, result.data.filename)}
                >
                  <i className="bx bx-download text-lg" />
                  다시 다운로드
                </Button>
              </section>
            </>
          )}
        </div>

        {/* 매체 규격 일괄 변환 — 단일 변환과 독립적인 보조 카드 */}
        {file && (
          <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <i className="bx bx-grid-alt text-xl text-violet-500" />
                <span className="text-sm font-semibold text-fg-body">매체 규격 일괄 변환</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 tracking-wide">
                  무료
                </span>
              </div>
              <MediaPresetBatch file={file} outputFormat={form.outputFormat} />
            </div>
          </div>
        )}

        {/* 안내 문구 */}
        <p className="text-center text-xs text-fg-subtle">
          업로드된 이미지는 서버에 저장되지 않으며, 메모리에서 즉시 처리 후 반환됩니다.
        </p>
      </div>
    </div>
  );
}

/* ── 내부 소형 컴포넌트 ─────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function ResultThumb({
  src,
  alt,
  label,
  width,
  height,
  bytes,
  deltaPercent,
  highlighted = false,
}: {
  src: string;
  alt: string;
  label: string;
  width: number;
  height: number;
  bytes: number;
  deltaPercent?: number;
  highlighted?: boolean;
}) {
  return (
    <figure className="text-center min-w-0">
      <div
        className={[
          'w-24 h-24 rounded-xl overflow-hidden mx-auto border',
          highlighted
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/40'
            : 'border-border bg-surface-3',
        ].join(' ')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full h-full object-contain" />
      </div>
      <figcaption className="mt-2 text-[11px] leading-snug text-fg-muted">
        {label}{' '}
        <span className="tabular-nums">
          {width}×{height}
        </span>
        <br />
        <span className="tabular-nums">{formatBytes(bytes)}</span>
        {/* 0%는 표기 가치가 없고, 음수(용량 증가)는 업스케일에선 정상이라 중립 톤 */}
        {deltaPercent !== undefined && deltaPercent !== 0 && (
          <span
            className={
              deltaPercent > 0
                ? 'ml-1 font-semibold text-emerald-600 dark:text-emerald-400'
                : 'ml-1 text-fg-subtle'
            }
          >
            ({deltaPercent > 0 ? `−${deltaPercent}%` : `+${-deltaPercent}%`})
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function SectionLabel({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-bold shrink-0">
        {number}
      </span>
      <span className="text-sm font-semibold text-fg-body">{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border" />;
}
