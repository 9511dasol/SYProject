'use client';

import { useState, useCallback, useEffect } from 'react';
import DropZone from '@/components/image-resize/DropZone';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import Button from '@/components/ui/Button';
import type { ImageDimensions, ResizeFormState } from '@/types/imageResize';
import { compressImageIfNeeded, resizeImage } from '@/lib/imageResizeClient';

const INITIAL_FORM: ResizeFormState = {
  targetWidth: '',
  targetHeight: '',
  keepAspectRatio: true,
  outputFormat: 'jpeg',
};

type ProcessingState = 'idle' | 'compressing' | 'resizing';

export default function ImageResizeClient() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions | null>(null);
  const [form, setForm] = useState<ResizeFormState>(INITIAL_FORM);
  const [processing, setProcessing] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isProcessing = processing !== 'idle';

  /* ── 파일 선택 ──────────────────────────────────────────────── */
  const handleFileSelect = useCallback(
    (f: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
      setFile(f);
      setError(null);
      setSuccessMsg(null);
      setForm(INITIAL_FORM);

      const img = new Image();
      img.onload = () => {
        const dims: ImageDimensions = { width: img.naturalWidth, height: img.naturalHeight };
        setOriginalDimensions(dims);
        setForm((prev) => ({
          ...prev,
          targetWidth: String(dims.width),
          targetHeight: String(dims.height),
        }));
      };
      img.src = url;
    },
    [previewUrl]
  );

  /* ── 초기화 ─────────────────────────────────────────────────── */
  const handleClear = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setOriginalDimensions(null);
    setForm(INITIAL_FORM);
    setError(null);
    setSuccessMsg(null);
  }, [previewUrl]);

  /* ── 가로 변경 (비율 유지 시 세로 자동 계산) ────────────────── */
  const handleWidthChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        if (!prev.keepAspectRatio || !originalDimensions) return { ...prev, targetWidth: value };
        const w = Number(value);
        if (w > 0) {
          const ratio = originalDimensions.height / originalDimensions.width;
          return { ...prev, targetWidth: value, targetHeight: String(Math.round(w * ratio)) };
        }
        return { ...prev, targetWidth: value };
      });
    },
    [originalDimensions]
  );

  /* ── 세로 변경 (비율 유지 시 가로 자동 계산) ────────────────── */
  const handleHeightChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        if (!prev.keepAspectRatio || !originalDimensions) return { ...prev, targetHeight: value };
        const h = Number(value);
        if (h > 0) {
          const ratio = originalDimensions.width / originalDimensions.height;
          return { ...prev, targetHeight: value, targetWidth: String(Math.round(h * ratio)) };
        }
        return { ...prev, targetHeight: value };
      });
    },
    [originalDimensions]
  );

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
    setSuccessMsg(null);

    try {
      setProcessing('compressing');
      const compressed = await compressImageIfNeeded(file);

      setProcessing('resizing');
      await resizeImage(compressed, w, h, form.outputFormat);

      setSuccessMsg('리사이즈 완료! 다운로드가 시작되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setProcessing('idle');
    }
  };

  /* ── 언마운트 시 URL 해제 ───────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // previewUrl 변경마다 cleanup 재등록 불필요 — 언마운트 시만 해제
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canResize = !!file && !!form.targetWidth && !!form.targetHeight && !isProcessing;

  const processingLabel =
    processing === 'compressing'
      ? '압축 중...'
      : processing === 'resizing'
      ? '리사이징 중...'
      : '리사이즈 & 다운로드';

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-violet-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/20 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* 헤더 */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-violet-500 dark:text-violet-400 uppercase bg-violet-50 dark:bg-violet-950/50 rounded-full px-4 py-1.5 ring-1 ring-violet-100 dark:ring-violet-900">
            <i className="bx bx-crop text-sm" />
            Image Resizer
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">이미지 리사이즈</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            JPEG · PNG · WebP 이미지를 원하는 크기로 무료 변환 · 서버에 저장되지 않습니다
          </p>
        </header>

        {/* 메인 카드 */}
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/50 dark:shadow-slate-950/50 overflow-hidden">
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
            </>
          )}

          {/* 상태 메시지 + 실행 버튼 */}
          {(error || successMsg || file) && (
            <>
              <Divider />
              <div className="p-6 space-y-4">
                {error && (
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
                    <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}
                {successMsg && (
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 px-4 py-3">
                    <i className="bx bx-check-circle text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">{successMsg}</p>
                  </div>
                )}

                {file && (
                  <Button
                    className="w-full bg-violet-600! hover:bg-violet-700! rounded-xl!"
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
        </div>

        {/* 안내 문구 */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          업로드된 이미지는 서버에 저장되지 않으며, 메모리에서 즉시 처리 후 반환됩니다.
        </p>
      </div>
    </div>
  );
}

/* ── 내부 소형 컴포넌트 ─────────────────────────────────────── */

function SectionLabel({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-bold shrink-0">
        {number}
      </span>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 dark:border-slate-800" />;
}
