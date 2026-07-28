'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import DropZone from '@/components/image-resize/DropZone';
import PlatformTabs from '@/components/heading-suggest/PlatformTabs';
import HeadingGrid, { HeadingGridSkeleton } from '@/components/heading-suggest/HeadingGrid';
import Button from '@/components/ui/Button';
import type { HeadingItem, HeadingLoadingState, PlatformFilter } from '@/types/heading';
import { fetchHeadings } from '@/lib/headingClient';

const LOADING_LABELS: Record<HeadingLoadingState, string> = {
  idle:        'AI 분석 후 문구 생성',
  compressing: '이미지 압축 중...',
  analyzing:   'Gemini가 분석 중...',
};

// 이전 생성 기록(썸네일 갤러리·마지막 작업 자동 복원)은 이 페이지에서 걷어냈다.
// 저장은 그대로 되고, 지난 기록은 '헤딩 문구 기록'(/heading-history) 페이지에서 본다.
export default function HeadingSuggestClient() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<HeadingLoadingState>('idle');
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeTab, setActiveTab] = useState<PlatformFilter>('전체');
  const [error, setError] = useState<string | null>(null);

  const isLoading = loading !== 'idle';

  /* ── 파일 선택 ──────────────────────────────────────────────── */
  const handleFileSelect = useCallback(
    (f: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(f));
      setFile(f);
      setHeadings([]);
      setError(null);
      setActiveTab('전체');
    },
    [previewUrl],
  );

  const handleClear = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setHeadings([]);
    setError(null);
    setActiveTab('전체');
  }, [previewUrl]);

  /* ── AI 분석 실행 ───────────────────────────────────────────── */
  const handleAnalyze = async () => {
    if (!file) return;
    setError(null);
    setHeadings([]);

    try {
      const record = await fetchHeadings(
        file,
        () => setLoading('compressing'),
        () => setLoading('analyzing'),
      );
      setHeadings(record.headings);
      setActiveTab('전체');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading('idle');
    }
  };

  /* ── 탭별 카운트 ────────────────────────────────────────────── */
  const counts = useMemo<Record<PlatformFilter, number>>(
    () => ({
      '전체':      headings.length,
      Instagram:  headings.filter((h) => h.platform === 'Instagram').length,
      Blog:       headings.filter((h) => h.platform === 'Blog').length,
      YouTube:    headings.filter((h) => h.platform === 'YouTube').length,
    }),
    [headings],
  );

  /* ── 언마운트 정리 ──────────────────────────────────────────── */
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-amber-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-amber-950/20 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* 헤더 */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-amber-500 dark:text-amber-400 uppercase bg-amber-50 dark:bg-amber-950/50 rounded-full px-4 py-1.5 ring-1 ring-amber-100 dark:ring-amber-900">
            <i className="bx bx-bulb text-sm" />
            AI Copywriter
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">헤딩 문구 추천</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            이미지를 업로드하면 Gemini가 매체별 마케팅 헤딩 문구 10개를 제안합니다
          </p>
        </header>

        {/* 업로드 카드 */}
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/50 dark:shadow-slate-950/50 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
              1
            </span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">마케팅 이미지 업로드</span>
          </div>

          <DropZone
            file={file}
            previewUrl={previewUrl}
            originalDimensions={null}
            onFileSelect={handleFileSelect}
            onClear={handleClear}
            disabled={isLoading}
          />

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
              <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {file && (
            <Button
              className="w-full bg-amber-500! hover:bg-amber-600! rounded-xl!"
              onClick={handleAnalyze}
              isLoading={isLoading}
              disabled={!file || isLoading}
            >
              {!isLoading && <i className="bx bx-bulb text-lg" />}
              {LOADING_LABELS[loading]}
            </Button>
          )}

          {/* AI 분석 중 인디케이터 */}
          {loading === 'analyzing' && (
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-full animate-ping opacity-60 bg-amber-400" />
                <span className="relative w-3 h-3 rounded-full block bg-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  Gemini가 이미지를 분석하는 중...
                </p>
                <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
                  512×512 썸네일로 Vision API 호출 중 · 보통 5~15초 소요
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 결과 영역 */}
        {(isLoading || headings.length > 0) && (
          <div className="space-y-4">
            {/* 플랫폼 탭 */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <PlatformTabs
                active={activeTab}
                counts={counts}
                onChange={setActiveTab}
              />
              {headings.length > 0 && (
                <div className="text-right">
                  <p
                    className={
                      headings.length < 10
                        ? 'text-xs font-medium text-amber-600 dark:text-amber-400'
                        : 'text-xs text-slate-400 dark:text-slate-500'
                    }
                  >
                    총 {headings.length}개 문구 생성됨
                    {headings.length < 10 && ' · AI가 목표치(10개)보다 적게 생성했어요'}
                  </p>
                </div>
              )}
            </div>

            {/* 카드 그리드 */}
            {isLoading
              ? <HeadingGridSkeleton />
              : <HeadingGrid headings={headings} filter={activeTab} />
            }
          </div>
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          AI 분석용 512×512 썸네일과 생성된 문구는 계정에 저장되며,{' '}
          <Link href="/heading-history" className="underline hover:text-slate-600 dark:hover:text-slate-300">
            헤딩 문구 기록
          </Link>
          에서 다시 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
