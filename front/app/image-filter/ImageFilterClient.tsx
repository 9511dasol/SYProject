'use client';

import { useState, useCallback, useEffect } from 'react';
import DropZone from '@/components/image-resize/DropZone';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import ConditionInput from '@/components/image-filter/ConditionInput';
import AiResultBanner from '@/components/image-filter/AiResultBanner';
import Button from '@/components/ui/Button';
import type { ImageDimensions, AiResult, FilterFormState, FilterProcessingState } from '@/types/imageFilter';
import { filterAndResize, FilterRejectedError } from '@/lib/imageFilterClient';

const INITIAL_FORM: FilterFormState = {
  condition: '',
  targetWidth: '',
  targetHeight: '',
  keepAspectRatio: true,
  outputFormat: 'jpeg',
};

const PROCESSING_LABELS: Record<FilterProcessingState, string> = {
  idle: 'AI 분석 후 다운로드',
  compressing: '이미지 압축 중...',
  analyzing: 'GPT-4o 분석 중...',
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

  /* ── AI 분석 & 다운로드 ─────────────────────────────────────── */
  const handleAnalyze = async () => {
    if (!file || !form.condition.trim()) return;

    const w = parseInt(form.targetWidth, 10) || 0;
    const h = parseInt(form.targetHeight, 10) || 0;

    setError(null);
    setAiResult(null);

    try {
      const { reason, provider } = await filterAndResize(
        file,
        form.condition,
        w,
        h,
        form.outputFormat,
        () => setProcessing('compressing'),
        () => setProcessing('analyzing'),
      );
      setAiResult({ pass: true, reason, provider });
    } catch (err) {
      if (err instanceof FilterRejectedError) {
        setAiResult({ pass: false, reason: err.reason, provider: err.provider, suggestions: err.suggestions });
      } else {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      }
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

  const canAnalyze = !!file && !!form.condition.trim() && !isProcessing;

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* 헤더 */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-500 dark:text-indigo-400 uppercase bg-indigo-50 dark:bg-indigo-950/50 rounded-full px-4 py-1.5 ring-1 ring-indigo-100 dark:ring-indigo-900">
            <i className="bx bx-brain text-sm" />
            AI Image Filter
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">이미지 정제</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            GPT-4o가 이미지를 분석해 조건을 충족하는 경우에만 리사이징 후 반환합니다
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

              {/* 섹션 2: 정제 조건 */}
              <section className="p-6">
                <SectionLabel
                  number={2}
                  label="정제 조건"
                  badge="GPT-4o"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-3">
                  AI가 조건을 분석합니다. 조건 불일치 시 다운로드가 차단됩니다.
                </p>
                <ConditionInput
                  value={form.condition}
                  onChange={(v) => setForm((prev) => ({ ...prev, condition: v }))}
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
                      조건 통과 시에만 적용됩니다.
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
                {/* AI 분석 중 인디케이터 */}
                {isProcessing && (
                  <AnalyzingIndicator state={processing} />
                )}

                {/* AI 판별 결과 배너 */}
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

                {/* 분석 버튼 */}
                <Button
                  className="w-full bg-indigo-600! hover:bg-indigo-700! rounded-xl!"
                  onClick={handleAnalyze}
                  isLoading={isProcessing}
                  disabled={!canAnalyze}
                >
                  {!isProcessing && <i className="bx bx-analyse text-lg" />}
                  {PROCESSING_LABELS[processing]}
                </Button>

                {!form.condition.trim() && !isProcessing && (
                  <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                    정제 조건을 입력해야 분석을 시작할 수 있습니다.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* 안내 문구 */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          이미지는 서버에 저장되지 않으며, AI 분석용 512×512 썸네일만 임시로 생성됩니다.
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

function AnalyzingIndicator({ state }: { state: FilterProcessingState }) {
  const isAI = state === 'analyzing';

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
          {isAI ? 'GPT-4o가 이미지를 분석하는 중...' : PROCESSING_LABELS[state]}
        </p>
        {isAI && (
          <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">
            512×512 썸네일로 Vision API 호출 중 · 보통 5~10초 소요
          </p>
        )}
      </div>
    </div>
  );
}
