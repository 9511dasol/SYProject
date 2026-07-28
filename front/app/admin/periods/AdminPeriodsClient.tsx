'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { authFetch } from '@/lib/api/authFetch';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import type { PeriodDeleteResponse, PeriodOverviewItem, PeriodOverviewResponse } from '@/types/periodAdmin';

function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dateRange(item: PeriodOverviewItem): string {
  if (!item.first_date || !item.last_date) return '-';
  return item.first_date === item.last_date
    ? item.first_date
    : `${item.first_date} ~ ${item.last_date}`;
}

/** 보유 여부를 색상만이 아니라 아이콘 + 텍스트로도 구분되게 표시한다. */
function HasBadge({ has, label }: { has: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${
        has ? 'text-fg' : 'text-fg-subtle'
      }`}
    >
      <i className={`bx ${has ? 'bx-check-circle' : 'bx-minus-circle'} text-sm`} />
      {label}
    </span>
  );
}

export default function AdminPeriodsClient() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = sessionStatus === 'authenticated' && session?.user.role === 'admin';

  const [items, setItems] = useState<PeriodOverviewItem[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PeriodOverviewItem | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((type: ToastItem['type'], message: string) => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }]);
  }, []);

  const load = useCallback(() => {
    if (!isAdmin) return;

    authFetch('/api/admin/periods')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? data.message ?? '기간 목록 조회 실패');
        return data as PeriodOverviewResponse;
      })
      .then((data) => {
        setItems(data.items);
        setTotalRows(data.total_rows);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '기간 목록 조회 실패'));
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const closeModal = () => {
    setTarget(null);
    setConfirmText('');
  };

  const handleDelete = async () => {
    if (!target) return;

    setDeleting(true);
    try {
      const res = await authFetch(`/api/admin/periods/${target.year}/${target.month}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.message ?? '삭제 실패');

      pushToast('success', (data as PeriodDeleteResponse).message);
      closeModal();
      load();
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setDeleting(false);
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-lock-alt text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">접근 권한이 없습니다</h2>
        <p className="text-sm text-fg-subtle">관리자만 접근할 수 있는 페이지입니다.</p>
      </div>
    );
  }

  // 오타로 엉뚱한 기간을 지우는 사고를 막기 위해 "2026-06" 형태를 직접 입력하게 한다.
  const confirmKey = target ? `${target.year}-${String(target.month).padStart(2, '0')}` : '';
  const canDelete = confirmText.trim() === confirmKey;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      <div>
        <h1 className="text-xl font-bold text-fg">업로드 데이터 관리</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          연월별로 저장된 마케팅 데이터 현황입니다. 잘못 올린 기간은 데이터 행 · 코멘트 · 엑셀 원본까지
          한 번에 삭제할 수 있습니다.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
          dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!items ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <i className="bx bx-data text-3xl text-fg-subtle" />
          <p className="text-sm text-fg-subtle">저장된 데이터가 없습니다.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg-subtle">
            총 <span className="font-semibold text-fg">{items.length}</span>개 기간 ·{' '}
            <span className="font-semibold text-fg">{formatCount(totalRows)}</span>행
          </p>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="border-b border-border-soft text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3">기간</th>
                  <th className="px-4 py-3 text-right">데이터 행</th>
                  <th className="px-4 py-3">데이터 범위</th>
                  <th className="px-4 py-3">보유 항목</th>
                  <th className="px-4 py-3">코멘트 갱신</th>
                  <th className="px-4 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={`${item.year}-${item.month}`}>
                    <td className="px-4 py-3 font-semibold text-fg whitespace-nowrap">
                      {item.year}년 {item.month}월
                    </td>
                    <td className="px-4 py-3 text-right text-fg-muted whitespace-nowrap">
                      {item.row_count === 0 ? (
                        <span className="text-fg-subtle">0</span>
                      ) : (
                        formatCount(item.row_count)
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{dateRange(item)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <HasBadge has={item.has_comment} label="코멘트" />
                        <HasBadge has={item.has_excel} label="엑셀 원본" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-fg-subtle whitespace-nowrap">
                      {formatDateTime(item.comment_updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setTarget(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5
                          text-xs font-semibold text-red-600 hover:bg-red-50 whitespace-nowrap
                          dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <i className="bx bx-trash text-sm" />
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={target !== null} onClose={closeModal} title="기간 데이터 삭제" icon="bx-trash">
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
              dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              <p className="font-semibold">
                {target.year}년 {target.month}월 데이터를 삭제합니다. 되돌릴 수 없습니다.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs">
                <li>· 데이터 행 {formatCount(target.row_count)}건</li>
                {target.has_comment && <li>· 저장된 AI 코멘트</li>}
                {target.has_excel && <li>· 스토리지에 보관된 엑셀 원본</li>}
              </ul>
            </div>

            <div>
              <label htmlFor="confirm-period" className="block text-sm font-medium text-fg">
                확인을 위해 <span className="font-mono font-bold">{confirmKey}</span> 를 입력하세요
              </label>
              <input
                id="confirm-period"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                placeholder={confirmKey}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg
                  focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal} className="px-4! py-2!">
                취소
              </Button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete || deleting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2
                  text-sm font-semibold text-white transition-all hover:brightness-110
                  disabled:pointer-events-none disabled:opacity-50"
              >
                {deleting && (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                )}
                삭제
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
