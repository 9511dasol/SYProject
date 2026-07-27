'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import DropZone from '@/components/image-resize/DropZone';
import PlatformTabs from '@/components/heading-suggest/PlatformTabs';
import HeadingGrid, { HeadingGridSkeleton } from '@/components/heading-suggest/HeadingGrid';
import Button from '@/components/ui/Button';
import type {
  HeadingItem,
  HeadingLoadingState,
  HeadingSuggestionRecord,
  PlatformFilter,
} from '@/types/heading';
import { deleteHeadingSuggestion, fetchHeadingHistory, fetchHeadings } from '@/lib/headingClient';

const LOADING_LABELS: Record<HeadingLoadingState, string> = {
  idle:        'AI 분석 후 문구 생성',
  compressing: '이미지 압축 중...',
  analyzing:   'Gemini가 분석 중...',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** 저장된 썸네일 이미지 URL (BFF 프록시 경유, 세션 쿠키로 인증). */
function imageUrl(id: number): string {
  return `/api/heading/history/${id}/image`;
}

export default function HeadingSuggestClient() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<HeadingLoadingState>('idle');
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeTab, setActiveTab] = useState<PlatformFilter>('전체');
  const [error, setError] = useState<string | null>(null);

  // 저장된 생성 기록 (사용자별 히스토리)
  const [history, setHistory] = useState<HeadingSuggestionRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null);
  const [restoredNotice, setRestoredNotice] = useState(false);

  // 사용자가 파일 선택/생성 등으로 이미 조작을 시작했으면 자동 복원을 막는다
  // (히스토리 로드가 늦게 도착해 현재 작업을 덮어쓰는 것을 방지).
  const interactedRef = useRef(false);

  const isLoading = loading !== 'idle';

  /* ── 마운트 시 저장된 기록 불러와 마지막 작업 복원 ───────────────── */
  useEffect(() => {
    let cancelled = false;
    fetchHeadingHistory()
      .then((items) => {
        if (cancelled || items.length === 0) return;
        setHistory(items);
        // 아직 이번 세션에서 아무 작업도 안 했을 때만 마지막 기록을 자동 복원
        if (!interactedRef.current) {
          setHeadings(items[0].headings);
          setActiveRecordId(items[0].id);
          setActiveTab('전체');
          setRestoredNotice(true);
        }
      })
      .catch(() => { /* 기록 조회 실패는 조용히 무시 (신규 생성은 그대로 가능) */ });
    return () => { cancelled = true; };
  }, []);

  /* ── 파일 선택 ──────────────────────────────────────────────── */
  const handleFileSelect = useCallback(
    (f: File) => {
      interactedRef.current = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(f));
      setFile(f);
      setHeadings([]);
      setError(null);
      setActiveTab('전체');
      setActiveRecordId(null);
      setRestoredNotice(false);
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
    setActiveRecordId(null);
    setRestoredNotice(false);
  }, [previewUrl]);

  /* ── AI 분석 실행 ───────────────────────────────────────────── */
  const handleAnalyze = async () => {
    if (!file) return;
    interactedRef.current = true;
    setError(null);
    setHeadings([]);
    setRestoredNotice(false);

    try {
      const record = await fetchHeadings(
        file,
        () => setLoading('compressing'),
        () => setLoading('analyzing'),
      );
      setHeadings(record.headings);
      setActiveTab('전체');
      setActiveRecordId(record.id);
      // 새로 생성된 기록을 히스토리 맨 앞에 추가
      setHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading('idle');
    }
  };

  /* ── 히스토리 항목 보기 / 삭제 ──────────────────────────────── */
  const handleSelectRecord = useCallback((record: HeadingSuggestionRecord) => {
    setHeadings(record.headings);
    setActiveRecordId(record.id);
    setActiveTab('전체');
    setError(null);
    setRestoredNotice(false);
  }, []);

  const handleDeleteRecord = useCallback(
    async (id: number) => {
      const prev = history;
      // 낙관적 제거
      setHistory((list) => list.filter((r) => r.id !== id));
      if (activeRecordId === id) {
        setHeadings([]);
        setActiveRecordId(null);
      }
      try {
        await deleteHeadingSuggestion(id);
      } catch (err) {
        setHistory(prev); // 실패 시 롤백
        setError(err instanceof Error ? err.message : '기록 삭제에 실패했습니다.');
      }
    },
    [history, activeRecordId],
  );

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

  const activeRecord = history.find((r) => r.id === activeRecordId) ?? null;

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

        {/* 이전 생성 기록 — 상단 썸네일 갤러리 (한눈에 보고 클릭해서 다시 보기) */}
        {history.length > 0 && (
          <section aria-label="이전 생성 기록" className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <i className="bx bx-history text-slate-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">이전 생성 기록</span>
              <span className="text-xs text-slate-400">{history.length}건</span>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {history.map((record) => {
                const active = record.id === activeRecordId;
                return (
                  <div key={record.id} className="relative shrink-0 w-32 group">
                    <button
                      type="button"
                      onClick={() => handleSelectRecord(record)}
                      title={record.image_filename || '무제 이미지'}
                      className={`block w-full text-left rounded-xl overflow-hidden border transition-all ${
                        active
                          ? 'border-amber-400 ring-2 ring-amber-300/60 dark:ring-amber-600/50'
                          : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'
                      }`}
                    >
                      {record.has_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrl(record.id)}
                          alt={record.image_filename || '생성 이미지'}
                          className="w-full h-20 object-cover bg-slate-100 dark:bg-slate-800"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-20 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600">
                          <i className="bx bx-image text-2xl" />
                        </div>
                      )}
                      <div className="px-2 py-1.5 bg-white dark:bg-slate-900">
                        <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">
                          {record.image_filename || '무제'}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {formatDate(record.created_at)} · {record.headings.length}개
                        </span>
                      </div>
                    </button>

                    {active && (
                      <span className="absolute top-1 left-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shadow">
                        보는 중
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteRecord(record.id)}
                      aria-label="기록 삭제"
                      title="이 기록 삭제"
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                    >
                      <i className="bx bx-x text-base" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
            {/* 복원 안내 배너 */}
            {restoredNotice && !isLoading && (
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 px-4 py-2.5">
                <i className="bx bx-history text-blue-500 dark:text-blue-400 shrink-0" />
                <p className="text-xs text-blue-600 dark:text-blue-300">
                  이전에 생성했던 문구를 불러왔어요. 위 <strong>이전 생성 기록</strong>에서 다른 작업도 볼 수 있습니다.
                </p>
              </div>
            )}

            {/* 플랫폼 탭 */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <PlatformTabs
                active={activeTab}
                counts={counts}
                onChange={setActiveTab}
              />
              {headings.length > 0 && (
                <div className="text-right">
                  {activeRecord && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      <i className="bx bx-bookmark text-amber-400" /> 저장된 기록 · {formatDate(activeRecord.created_at)}
                    </p>
                  )}
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
          AI 분석용 512×512 썸네일과 생성된 문구가 계정에 저장되어, 다음에 다시 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
