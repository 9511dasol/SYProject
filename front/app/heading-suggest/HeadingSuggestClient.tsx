'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import DropZone from '@/components/image-resize/DropZone';
import PlatformTabs from '@/components/heading-suggest/PlatformTabs';
import HeadingGrid, { HeadingGridSkeleton } from '@/components/heading-suggest/HeadingGrid';
import Button from '@/components/ui/Button';
import type { HeadingItem, HeadingLoadingState, Platform, PlatformFilter } from '@/types/heading';
import { useImageUpload } from '@/hooks/useImageUpload';
import { isUserCancel } from '@/lib/api/authFetch';
import { fetchHeadings } from '@/lib/headingClient';

const LOADING_LABELS: Record<HeadingLoadingState, string> = {
  idle:        'AI 분석 후 문구 생성',
  compressing: '이미지 압축 중...',
  analyzing:   'Gemini가 분석 중...',
};

// 이전 생성 기록(썸네일 갤러리·마지막 작업 자동 복원)은 이 페이지에서 걷어냈다.
// 저장은 그대로 되고, 지난 기록은 '헤딩 문구 기록'(/heading-history) 페이지에서 본다.
export default function HeadingSuggestClient() {
  const [loading, setLoading] = useState<HeadingLoadingState>('idle');
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeTab, setActiveTab] = useState<PlatformFilter>('전체');
  const [error, setError] = useState<string | null>(null);
  /* 플랫폼별 재생성의 병합 대상 — 전체 생성 성공 시 기록 ID를 잡아둔다 */
  const [recordId, setRecordId] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState<Platform | null>(null);

  const isLoading = loading !== 'idle';

  /* ── 파일 선택 (업로드·미리보기·URL 해제는 공용 훅) ─────────── */
  const { file, previewUrl, select, clear } = useImageUpload();

  const handleFileSelect = useCallback(
    (f: File) => {
      setHeadings([]);
      setError(null);
      setActiveTab('전체');
      // 다른 이미지의 기록에 병합되면 안 된다 — 파일이 바뀌면 병합 대상도 버린다
      setRecordId(null);
      select(f);
    },
    [select],
  );

  const handleClear = useCallback(() => {
    clear();
    setHeadings([]);
    setError(null);
    setActiveTab('전체');
    setRecordId(null);
  }, [clear]);

  /* ── AI 분석 실행 ───────────────────────────────────────────── */
  // Vision 호출이라 상한을 두지 않는다 — 대신 끊을 수단을 준다
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleAnalyze = async () => {
    if (!file) return;
    setError(null);
    setHeadings([]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const record = await fetchHeadings(
        file,
        () => setLoading('compressing'),
        () => setLoading('analyzing'),
        controller.signal,
      );
      setHeadings(record.headings);
      setRecordId(record.id);
      setActiveTab('전체');
    } catch (err) {
      // 사용자가 직접 끊은 건 실패가 아니다
      if (!isUserCancel(err)) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      abortRef.current = null;
      setLoading('idle');
    }
  };

  const handleCancel = useCallback(() => abortRef.current?.abort(), []);

  /* ── 플랫폼별 재생성 — 전체를 다시 돌리지 않고 한 플랫폼만 교체 ── */
  const handleRegenerate = async (platform: Platform) => {
    if (!file || recordId === null || regenerating) return;
    setError(null);
    setRegenerating(platform);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const record = await fetchHeadings(file, undefined, undefined, controller.signal, {
        platform,
        recordId,
      });
      setHeadings(record.headings);
    } catch (err) {
      if (!isUserCancel(err)) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      abortRef.current = null;
      setRegenerating(null);
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

  /* objectURL 해제는 useImageUpload 가 맡는다 — 예전 정리 함수는 첫 렌더의
     previewUrl(null)을 클로저로 잡고 있어 실제로는 아무것도 해제하지 못했다 */

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-bg via-surface to-amber-50/30 dark:to-amber-950/20 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* 헤더 */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-amber-500 dark:text-amber-400 uppercase bg-amber-50 dark:bg-amber-950/50 rounded-full px-4 py-1.5 ring-1 ring-amber-100 dark:ring-amber-900">
            <i className="bx bx-bulb text-sm" />
            AI Copywriter
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">헤딩 문구 추천</h1>
          <p className="text-sm text-fg-muted">
            이미지를 업로드하면 Gemini가 매체별 마케팅 헤딩 문구 10개를 제안합니다
          </p>
        </header>

        {/* 업로드 카드 */}
        <div className="rounded-2xl border border-border bg-surface shadow-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
              1
            </span>
            <span className="text-sm font-semibold text-fg-body">마케팅 이미지 업로드</span>
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
              tone="amber"
              className="w-full"
              onClick={handleAnalyze}
              isLoading={isLoading}
              disabled={!file || isLoading}
            >
              {!isLoading && <i className="bx bx-bulb text-lg" />}
              {LOADING_LABELS[loading]}
            </Button>
          )}

          {/* 분석 중에는 기다리는 것 말고 선택지가 없었다 — 끊을 수 있게 한다 */}
          {isLoading && (
            <Button variant="outline" className="w-full" onClick={handleCancel}>
              <i className="bx bx-x text-lg" />
              취소
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
            {/* 플랫폼 탭 + 분석 이미지 — 문구는 이미지와 대조하며 고르는 것이라,
                스크롤 중에도 어떤 이미지의 문구인지 보이도록 바를 고정한다 */}
            {/* top-16: 앱 헤더(h-14, sticky)가 위에 있으므로 그 아래에 멈춰야 가려지지 않는다 */}
            <div className="sticky top-16 z-10 flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-border bg-surface/95 backdrop-blur px-3 py-2 shadow-card">
              <div className="flex items-center gap-3 flex-wrap">
                {previewUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewUrl}
                    alt={file ? `분석한 이미지: ${file.name}` : '분석한 이미지'}
                    title={file?.name}
                    className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                  />
                )}
                <PlatformTabs
                  active={activeTab}
                  counts={counts}
                  onChange={setActiveTab}
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* 한 플랫폼 탭을 보고 있을 때만 — "이 플랫폼만 다시"가 성립하는 맥락 */}
                {activeTab !== '전체' && recordId !== null && headings.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerate(activeTab)}
                    isLoading={regenerating === activeTab}
                    disabled={isLoading || regenerating !== null}
                  >
                    {regenerating !== activeTab && <i className="bx bx-refresh text-base" />}
                    {activeTab}만 다시
                  </Button>
                )}
                {headings.length > 0 && (
                  <p
                    className={
                      headings.length < 10
                        ? 'text-xs font-medium text-amber-600 dark:text-amber-400'
                        : 'text-xs text-fg-subtle'
                    }
                  >
                    총 {headings.length}개 문구 생성됨
                    {headings.length < 10 && ' · AI가 목표치(10개)보다 적게 생성했어요'}
                  </p>
                )}
              </div>
            </div>

            {/* 카드 그리드 */}
            {isLoading
              ? <HeadingGridSkeleton />
              : <HeadingGrid headings={headings} filter={activeTab} />
            }
          </div>
        )}

        <p className="text-center text-xs text-fg-subtle">
          AI 분석용 512×512 썸네일과 생성된 문구는 계정에 저장되며,{' '}
          <Link href="/heading-history" className="underline hover:text-fg-muted">
            헤딩 문구 기록
          </Link>
          에서 다시 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
