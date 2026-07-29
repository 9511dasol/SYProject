'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import type { MediaBudgetsResponse } from '@/types/periodAdmin';

interface Props {
  year: number;
  month: number;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 입력 중에는 문자열로 들고 있어야 "1000"을 지웠다 다시 쓰는 동작이 자연스럽다. */
type Draft = Record<string, string>;

function toDraft(data: MediaBudgetsResponse): Draft {
  return Object.fromEntries(
    data.media.map((m) => [m, data.budgets[m] != null ? String(data.budgets[m]) : '']),
  );
}

/**
 * 기간별 매체 예산 입력.
 *
 * 호출하는 쪽에서 열 때만 마운트한다 — 닫을 때 언마운트되면서 조회 결과와 입력 중이던
 * 값이 함께 사라지므로, 다음에 열 때 옛 기간의 값이 잠깐 비치는 일이 없다.
 */
export default function MediaBudgetModal({ year, month, onClose, onSaved, onError }: Props) {
  const [data, setData] = useState<MediaBudgetsResponse | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    authFetch(`/api/admin/periods/${year}/${month}/budgets`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail ?? body.message ?? '예산 조회 실패');
        return body as MediaBudgetsResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setDraft(toDraft(body));
      })
      .catch((err) => {
        if (!cancelled) onError(err instanceof Error ? err.message : '예산 조회 실패');
      });

    return () => {
      cancelled = true;
    };
  }, [year, month, onError]);

  const handleSave = useCallback(async () => {
    // 빈칸은 "설정 안 함" — 0을 저장해 예산소진율을 0으로 만드는 것과 구분한다.
    const budgets = Object.fromEntries(
      Object.entries(draft)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => [k, Number(v)]),
    );
    const invalid = Object.entries(budgets).filter(([, v]) => !Number.isFinite(v) || v < 0);
    if (invalid.length > 0) {
      onError(`예산은 0 이상의 숫자여야 합니다: ${invalid.map(([k]) => k).join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/periods/${year}/${month}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgets }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.message ?? '예산 저장 실패');

      onSaved(`${year}년 ${month}월 매체별 예산을 저장했습니다.`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : '예산 저장 실패');
    } finally {
      setSaving(false);
    }
  }, [draft, year, month, onClose, onSaved, onError]);

  const inherited =
    data !== null && data.inherited_from !== null && data.inherited_from !== periodKey(year, month);

  return (
    <Modal open onClose={onClose} title={`매체별 예산 · ${year}년 ${month}월`} icon="bx-wallet">
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-subtle">
            엑셀 summary 시트의 <span className="font-semibold text-fg">■ 매체별 예산</span> 에
            들어가는 값입니다. 예산소진율 · 잔여광고비 · 잔여일예산이 이 값으로 계산됩니다.
          </p>

          {inherited && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800
              dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400">
              이 기간에 저장된 예산이 없어 <span className="font-semibold">{data.inherited_from}</span>{' '}
              값을 이어받아 보여주고 있습니다. 그대로 저장하면 이 기간의 값으로 고정됩니다.
            </div>
          )}

          <div className="space-y-2">
            {data.media.map((media) => (
              <div key={media} className="flex items-center gap-3">
                <label
                  htmlFor={`budget-${media}`}
                  className="w-24 shrink-0 text-sm font-medium text-fg"
                >
                  {media}
                </label>
                <input
                  id={`budget-${media}`}
                  inputMode="numeric"
                  value={draft[media] ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [media]: e.target.value.replace(/[^\d.]/g, '') }))
                  }
                  placeholder="미설정"
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-right text-sm
                    text-fg tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="w-16 shrink-0 text-right text-xs text-fg-subtle tabular-nums">
                  {draft[media] && Number.isFinite(Number(draft[media]))
                    ? Number(draft[media]).toLocaleString('ko-KR')
                    : '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="px-4! py-2!">
              취소
            </Button>
            <Button onClick={handleSave} isLoading={saving} className="px-4! py-2!">
              저장
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
