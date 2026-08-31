'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { queryKeys } from '@/lib/queryKeys';
import MediaBudgetModal from '@/components/admin/MediaBudgetModal';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import { formatCount, formatDateTime } from '@/lib/format';
import { useToast } from '@/components/providers/ToastProvider';
import type { PeriodDeleteResponse, PeriodOverviewItem, PeriodOverviewResponse } from '@/types/periodAdmin';

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
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();

  const [target, setTarget] = useState<PeriodOverviewItem | null>(null);
  const [budgetTarget, setBudgetTarget] = useState<PeriodOverviewItem | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const periodsQuery = useQuery({
    queryKey: queryKeys.adminPeriods(),
    queryFn: () =>
      fetchJson<PeriodOverviewResponse>('/api/admin/periods', undefined, '기간 목록 조회 실패'),
  });

  const reload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.adminPeriods() });
  }, [queryClient]);

  // 예산 모달은 이 콜백들을 effect 의존성으로 쓴다 — 매 렌더 새 함수를 넘기면
  // 부모가 다시 그려질 때마다 조회가 다시 돌아 입력 중이던 값이 날아간다.
  const handleBudgetSaved = useCallback(
    (message: string) => {
      pushToast('success', message);
      reload();
    },
    [pushToast, reload],
  );
  const handleBudgetError = useCallback(
    (message: string) => pushToast('error', message),
    [pushToast],
  );

  const closeModal = () => {
    setTarget(null);
    setConfirmText('');
  };

  const deleteMutation = useMutation({
    mutationFn: (item: PeriodOverviewItem) =>
      sendJson<PeriodDeleteResponse>(
        `/api/admin/periods/${item.year}/${item.month}`,
        'DELETE',
        undefined,
        '삭제 실패',
      ),
    onSuccess: (data) => {
      pushToast('success', data.message);
      closeModal();
      // 기간을 지우면 대시보드의 기간 목록·요약도 더 이상 맞지 않는다
      reload();
      queryClient.invalidateQueries({ queryKey: queryKeys.periods() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSummaries() });
    },
    onError: (err) => pushToast('error', err.message),
  });

  const items = periodsQuery.data?.items ?? null;
  const totalRows = periodsQuery.data?.total_rows ?? 0;
  const error = periodsQuery.error;
  const deleting = deleteMutation.isPending;

  const handleDelete = () => {
    if (target) deleteMutation.mutate(target);
  };

  // 오타로 엉뚱한 기간을 지우는 사고를 막기 위해 "2026-06" 형태를 직접 입력하게 한다.
  const confirmKey = target ? `${target.year}-${String(target.month).padStart(2, '0')}` : '';
  const canDelete = confirmText.trim() === confirmKey;

  const columns: Column<PeriodOverviewItem>[] = [
    {
      header: '기간',
      primary: true,
      className: 'font-semibold text-fg whitespace-nowrap',
      cell: (item) => `${item.year}년 ${item.month}월`,
    },
    {
      header: '데이터 행',
      align: 'right',
      className: 'whitespace-nowrap',
      cell: (item) =>
        item.row_count === 0 ? <span className="text-fg-subtle">0</span> : formatCount(item.row_count),
    },
    {
      header: '데이터 범위',
      className: 'whitespace-nowrap',
      cell: (item) => dateRange(item),
    },
    {
      header: '보유 항목',
      cell: (item) => (
        <div className="flex flex-col gap-0.5">
          <HasBadge has={item.has_comment} label="코멘트" />
          <HasBadge has={item.has_excel} label="엑셀 원본" />
          <HasBadge has={item.has_budget} label="매체별 예산" />
        </div>
      ),
    },
    {
      header: '코멘트 갱신',
      className: 'text-fg-subtle whitespace-nowrap',
      cell: (item) => formatDateTime(item.comment_updated_at),
    },
    {
      header: '작업',
      align: 'right',
      cell: (item) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setBudgetTarget(item)}>
            <i className="bx bx-wallet text-sm" />
            예산
          </Button>
          <Button variant="ghost" tone="danger" size="sm" onClick={() => setTarget(item)}>
            <i className="bx bx-trash text-sm" />
            삭제
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">업로드 데이터 관리</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          연월별로 저장된 마케팅 데이터 현황입니다. 잘못 올린 기간은 데이터 행 · 코멘트 · 엑셀 원본까지
          한 번에 삭제할 수 있습니다. 엑셀 리포트의 <span className="font-medium text-fg-muted">매체별 예산</span>{' '}
          도 여기서 기간별로 입력합니다 — 입력하지 않은 기간은 그 이전에 입력한 값을 이어받습니다.
        </p>
      </div>

      {error && <Alert>{error.message}</Alert>}

      {items && items.length > 0 && (
        <p className="text-sm text-fg-subtle">
          총 <span className="font-semibold text-fg">{items.length}</span>개 기간 ·{' '}
          <span className="font-semibold text-fg">{formatCount(totalRows)}</span>행
        </p>
      )}

      <DataTable
        rows={items}
        rowKey={(item) => `${item.year}-${item.month}`}
        columns={columns}
        minWidth="min-w-180"
        empty={{
          icon: 'bx-data',
          title: '저장된 데이터가 없습니다.',
          description: '대시보드의 데이터 업로드에서 CSV 또는 엑셀을 저장하면 여기에 기간이 나타납니다.',
        }}
      />

      {budgetTarget && (
        <MediaBudgetModal
          year={budgetTarget.year}
          month={budgetTarget.month}
          onClose={() => setBudgetTarget(null)}
          onSaved={handleBudgetSaved}
          onError={handleBudgetError}
        />
      )}

      <Modal open={target !== null} onClose={closeModal} title="기간 데이터 삭제" icon="bx-trash">
        {target && (
          <div className="space-y-4">
            <Alert>
              <p className="font-semibold">
                {target.year}년 {target.month}월 데이터를 삭제합니다. 되돌릴 수 없습니다.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs">
                <li>· 데이터 행 {formatCount(target.row_count)}건</li>
                {target.has_comment && <li>· 저장된 AI 코멘트</li>}
                {target.has_excel && <li>· 스토리지에 보관된 엑셀 원본</li>}
                {target.has_budget && <li>· 이 기간에 입력한 매체별 예산</li>}
              </ul>
            </Alert>

            <Input
              label={`확인을 위해 ${confirmKey} 를 입력하세요`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder={confirmKey}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="md" onClick={closeModal}>
                취소
              </Button>
              <Button
                tone="danger"
                size="md"
                onClick={handleDelete}
                disabled={!canDelete}
                isLoading={deleting}
              >
                삭제
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
