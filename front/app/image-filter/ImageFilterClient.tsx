'use client';

import { useState, useCallback, useEffect } from 'react';
import DropZone from '@/components/image-resize/DropZone';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import PromptInput from '@/components/image-filter/PromptInput';
import AiResultBanner from '@/components/image-filter/AiResultBanner';
import Button from '@/components/ui/Button';
import type { ImageDimensions, AiResult, FilterFormState, FilterProcessingState } from '@/types/imageFilter';
import { editAndResize } from '@/lib/imageFilterClient';

const INITIAL_FORM: FilterFormState = {
  prompt: '',
  targetWidth: '',
  targetHeight: '',
  keepAspectRatio: true,
  outputFormat: 'jpeg',
  useAiUpscale: false,
};

const PROCESSING_LABELS: Record<FilterProcessingState, string> = {
  idle: 'AI 편집 후 다운로드',
  compressing: '이미지 압축 중...',
  editing: 'Gemini가 편집하는 중...',
  resizing: '리사이징 중...',
};

export default function ImageFilterClient() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions | null>(null);
  const [form, setForm] = useState<FilterFormState>(INITIAL_FORM);
  const [processing, setProcessing] = useState<FilterProcessingState>('idle');
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProcessing = processing !== 'idle';

  /* ── 파일 선택 ──────────────────────────────────────────────── */
  const handleFileSelect = useCallback(
    (f: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
      setFile(f);
      setAiResult(null);
      setError(null);
      setForm((prev) => ({ ...prev, targetWidth: '', targetHeight: '' }));

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
    [previewUrl],
  );

  /* ── 초기화 ─────────────────────────────────────────────────── */
  const handleClear = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setOriginalDimensions(null);
    setForm(INITIAL_FORM);
    setAiResult(null);
    setError(null);
  }, [previewUrl]);

  /* ── 가로 변경 (비율 유지) ──────────────────────────────────── */
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
    [originalDimensions],
  );

  /* ── 세로 변경 (비율 유지) ──────────────────────────────────── */
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
    [originalDimensions],
  );

  /* ── AI 편집 & 다운로드 ─────────────────────────────────────── */
  const handleEdit = async () => {
    if (!file || !form.prompt.trim()) return;

    const w = parseInt(form.targetWidth, 10) || 0;
    const h = parseInt(form.targetHeight, 10) || 0;

    setError(null);
    setAiResult(null);

    try {
      const { provider } = await editAndResize(
        file,
        form.prompt,
        w,
        h,
        form.outputFormat,
        () => setProcessing('compressing'),
        () => setProcessing('editing'),
      );
      setAiResult({ provider });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setProcessing('idle');
    }
  };

  /* ── 언마운트 정리 ──────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canEdit = !!file && !!form.prompt.trim() && !isProcessing;

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* 헤더 */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-500 dark:text-indigo-400 uppercase bg-indigo-50 dark:bg-indigo-950/50 rounded-full px-4 py-1.5 ring-1 ring-indigo-100 dark:ring-indigo-900">
            <i className="bx bx-magic-wand text-sm" />
            AI Image Edit
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">이미지 정제</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            원하는 대로 프롬프트를 입력하면 Gemini가 이미지를 수정해 돌려드립니다
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

          {file && (
            <>
              <Divider />

              {/* 섹션 2: 편집 프롬프트 */}
              <section className="p-6">
                <SectionLabel
                  number={2}
                  label="편집 프롬프트"
                  badge="Gemini"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-3">
                  이미지를 어떻게 바꾸고 싶은지 자유롭게 입력하세요.
                </p>
                <PromptInput
                  value={form.prompt}
                  onChange={(v) => setForm((prev) => ({ ...prev, prompt: v }))}
                  disabled={isProcessing}
                />
              </section>

              {originalDimensions && (
                <>
                  <Divider />

                  {/* 섹션 3: 크기 설정 */}
                  <section className="p-6">
                    <SectionLabel number={3} label="리사이즈 크기" />
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-3">
                      편집 완료 후 이 크기로 리사이즈됩니다.
                    </p>
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
                  </section>

                  <Divider />

                  {/* 섹션 4: 출력 포맷 */}
                  <section className="p-6">
                    <SectionLabel number={4} label="출력 포맷" />
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

              {/* 결과 & 액션 */}
              <Divider />
              <div className="p-6 space-y-4">
                {/* AI 처리 중 인디케이터 */}
                {isProcessing && (
                  <ProcessingIndicator state={processing} />
                )}

                {/* AI 편집 결과 배너 */}
                {!isProcessing && aiResult && (
                  <AiResultBanner result={aiResult} />
                )}

                {/* 일반 에러 */}
                {!isProcessing && error && (
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
                    <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                {/* 실행 버튼 */}
                <Button
                  className="w-full bg-indigo-600! hover:bg-indigo-700! rounded-xl!"
                  onClick={handleEdit}
                  isLoading={isProcessing}
                  disabled={!canEdit}
                >
                  {!isProcessing && <i className="bx bx-magic-wand text-lg" />}
                  {PROCESSING_LABELS[processing]}
                </Button>

                {!form.prompt.trim() && !isProcessing && (
                  <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                    편집 프롬프트를 입력해야 시작할 수 있습니다.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* 안내 문구 */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          이미지는 서버에 저장되지 않으며, AI 편집 처리 후 즉시 반환됩니다.
        </p>
      </div>
    </div>
  );
}

/* ── 내부 소형 컴포넌트 ──────────────────────────────────────── */

function SectionLabel({
  number,
  label,
  badge,
}: {
  number: number;
  label: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
        {number}
      </span>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      {badge && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 tracking-wide">
          {badge}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 dark:border-slate-800" />;
}

function ProcessingIndicator({ state }: { state: FilterProcessingState }) {
  const isAI = state === 'editing';

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3.5 border ${
        isAI
          ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
      }`}
    >
      {/* 펄스 애니메이션 */}
      <div className="relative shrink-0">
        <span
          className={`absolute inset-0 rounded-full animate-ping opacity-60 ${
            isAI ? 'bg-indigo-400' : 'bg-slate-400'
          }`}
        />
        <span
          className={`relative w-3 h-3 rounded-full block ${
            isAI ? 'bg-indigo-500' : 'bg-slate-400'
          }`}
        />
      </div>

      <div>
        <p
          className={`text-sm font-semibold ${
            isAI ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {isAI ? 'Gemini가 이미지를 편집하는 중...' : PROCESSING_LABELS[state]}
        </p>
        {isAI && (
          <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">
            프롬프트에 따라 이미지를 생성 중 · 보통 5~10초 소요
          </p>
        )}
      </div>
    </div>
  );
}
