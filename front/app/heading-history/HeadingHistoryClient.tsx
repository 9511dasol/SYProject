'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import HeadingGrid from '@/components/heading-suggest/HeadingGrid';
import PlatformTabs from '@/components/heading-suggest/PlatformTabs';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import { deleteHeadingSuggestion, fetchHeadingHistoryPage } from '@/lib/headingClient';
import type { HeadingSuggestionRecord, PlatformFilter } from '@/types/heading';

const PAGE_SIZE = 24;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** 저장된 썸네일 URL (BFF 프록시 경유, 세션 쿠키로 인증) */
function imageUrl(id: number): string {
  return `/api/heading/history/${id}/image`;
}

function countsOf(record: HeadingSuggestionRecord | null): Record<PlatformFilter, number> {
  const headings = record?.headings ?? [];
  return {
    '전체': headings.length,
    Instagram: headings.filter((h) => h.platform === 'Instagram').length,
    Blog: headings.filter((h) => h.platform === 'Blog').length,
    YouTube: headings.filter((h) => h.platform === 'YouTube').length,
  };
}

export default function HeadingHistoryClient() {
  const [records, setRecords] = useState<HeadingSuggestionRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [detail, setDetail] = useState<HeadingSuggestionRecord | null>(null);
  const [detailTab, setDetailTab] = useState<PlatformFilter>('전체');
  const [pendingDelete, setPendingDelete] = useState<HeadingSuggestionRecord | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((type: ToastItem['type'], message: string) => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }]);
  }, []);

  /* ── 첫 페이지 ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    fetchHeadingHistoryPage(PAGE_SIZE, 0)
      .then((data) => {
        if (cancelled) return;
        setRecords(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setRecords([]);
        setError(err instanceof Error ? err.message : '기록을 불러오지 못했습니다.');
      });
    return () => { cancelled = true; };
  }, []);

  /* ── 더 보기 ──────────────────────────────────────────────────────────── */
  const handleLoadMore = async () => {
    if (!records) return;
    setLoadingMore(true);
    try {
      const data = await fetchHeadingHistoryPage(PAGE_SIZE, records.length);
      // 사이에 새 기록이 생기면 같은 항목이 다음 페이지에도 올 수 있어 id로 걸러낸다.
      setRecords((prev) => {
        const seen = new Set((prev ?? []).map((r) => r.id));
        return [...(prev ?? []), ...data.items.filter((r) => !seen.has(r.id))];
      });
      setTotal(data.total);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '더 불러오지 못했습니다.');
    } finally {
      setLoadingMore(false);
    }
  };

  /* ── 삭제 ─────────────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const snapshot = records ?? [];

    setPendingDelete(null);
    setRecords((prev) => (prev ?? []).filter((r) => r.id !== target.id));
    setTotal((t) => Math.max(0, t - 1));
    if (detail?.id === target.id) setDetail(null);

    try {
      await deleteHeadingSuggestion(target.id);
      pushToast('success', '기록을 삭제했습니다.');
    } catch (err) {
      setRecords(snapshot); // 실패 시 되돌린다
      setTotal(snapshot.length);
      pushToast('error', err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  /* ── 복사 ─────────────────────────────────────────────────────────────── */
  const handleCopyAll = async (record: HeadingSuggestionRecord) => {
    const text = record.headings
      .map((h) => `[${h.platform}] ${h.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      pushToast('success', `문구 ${record.headings.length}개를 복사했습니다.`);
    } catch {
      pushToast('error', '클립보드 복사에 실패했습니다.');
    }
  };

  /* ── 검색 (파일명 · 문구 본문) ────────────────────────────────────────── */
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword || !records) return records ?? [];
    return records.filter(
      (r) =>
        r.image_filename.toLowerCase().includes(keyword) ||
        r.headings.some((h) => h.text.toLowerCase().includes(keyword)),
    );
  }, [records, query]);

  const hasMore = records !== null && records.length < total;

  /* ── 렌더 ─────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-amber-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-amber-950/20 py-10 px-4">
      <ToastContainer toasts={toasts} onRemove={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-amber-500 dark:text-amber-400 uppercase bg-amber-50 dark:bg-amber-950/50 rounded-full px-4 py-1.5 ring-1 ring-amber-100 dark:ring-amber-900">
            <i className="bx bx-history text-sm" />
            History
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                헤딩 문구 기록
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                지금까지 생성한 문구를 모아 봅니다. 생성 페이지의 썸네일 스트립은 최근 것만 보여주지만,
                여기서는 오래된 기록까지 이어서 찾을 수 있습니다.
              </p>
            </div>
            <Link
              href="/heading-suggest"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold
                text-white shadow-sm shadow-amber-300/50 transition-all hover:bg-amber-600 dark:shadow-amber-900/50"
            >
              <i className="bx bx-bulb text-base" />
              새 문구 만들기
            </Link>
          </div>
        </header>

        {/* 검색 */}
        {records !== null && records.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-60">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="파일명 또는 문구 내용으로 검색"
                aria-label="기록 검색"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900
                  py-2.5 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200
                  focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {query.trim()
                ? `${visible.length}건 검색됨 (불러온 ${records.length}건 중)`
                : `${records.length} / ${total}건`}
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
            <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {records === null ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <i className="bx bx-image-alt text-4xl text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">아직 생성한 문구가 없습니다</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                이미지를 업로드하면 매체별 헤딩 문구를 만들어 드립니다.
              </p>
            </div>
            <Link href="/heading-suggest" className="text-sm font-semibold text-amber-600 hover:text-amber-700">
              문구 만들러 가기 <i className="bx bx-right-arrow-alt align-middle" />
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400 dark:text-slate-500">
            <i className="bx bx-search-alt text-4xl" />
            <p className="text-sm">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {visible.map((record) => (
                <div
                  key={record.id}
                  className="group relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700
                    bg-white dark:bg-slate-900 shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => { setDetail(record); setDetailTab('전체'); }}
                    className="block w-full text-left"
                  >
                    {record.has_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl(record.id)}
                        alt={record.image_filename || '생성 이미지'}
                        className="w-full h-32 object-cover bg-slate-100 dark:bg-slate-800"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600">
                        <i className="bx bx-image text-3xl" />
                      </div>
                    )}
                    <div className="px-3 py-2.5">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate"
                        title={record.image_filename || '무제'}>
                        {record.image_filename || '무제'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {formatDate(record.created_at)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        문구 {record.headings.length}개
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDelete(record)}
                    aria-label={`${record.image_filename || '무제'} 기록 삭제`}
                    title="이 기록 삭제"
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full
                      bg-black/45 text-white opacity-0 transition-all group-hover:opacity-100
                      focus-visible:opacity-100 hover:bg-red-500"
                  >
                    <i className="bx bx-trash text-sm" />
                  </button>
                </div>
              ))}
            </div>

            {hasMore && !query.trim() && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700
                    bg-white dark:bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300
                    transition-all hover:border-amber-300 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loadingMore ? (
                    <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                  ) : (
                    <i className="bx bx-chevron-down text-base" />
                  )}
                  더 보기 ({total - records.length}건 남음)
                </button>
              </div>
            )}

            {hasMore && query.trim() && (
              <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                검색은 지금까지 불러온 {records.length}건에서만 이뤄집니다. 더 보기로 기록을 추가하면 검색 범위도 넓어집니다.
              </p>
            )}
          </>
        )}
      </div>

      {/* 상세 보기 */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.image_filename || '생성 기록'}
        icon="bx-bulb"
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {formatDate(detail.created_at)} · 문구 {detail.headings.length}개
              </p>
              <button
                type="button"
                onClick={() => handleCopyAll(detail)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700
                  px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <i className="bx bx-copy text-sm" />
                전체 복사
              </button>
            </div>

            <PlatformTabs active={detailTab} counts={countsOf(detail)} onChange={setDetailTab} />
            <HeadingGrid headings={detail.headings} filter={detailTab} />
          </div>
        )}
      </Modal>

      {/* 삭제 확인 */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="기록 삭제"
        icon="bx-trash"
      >
        {pendingDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {pendingDelete.image_filename || '무제'}
              </span>{' '}
              기록과 저장된 썸네일을 삭제합니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold
                  text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
