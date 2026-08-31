'use client';

import { useState } from 'react';
import ScrollableTable from '@/components/ui/ScrollableTable';
import type { EnrichedRow } from '@/hooks/usePendingRows';
import { hasAnyMetric } from '@/lib/marketingMetrics';
import type { MediaDailyRow, RowDiff } from '@/types/marketing';
import { DiffBadge, PendingBadge } from './Badges';
import RowDetailModal from './RowDetailModal';
import { NUM_CELL, STICKY_CELL, fmt } from './shared';

const BASE_HEADERS = ['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비'];
const CONV_HEADERS = [
  '전환수', '전환율', '전환단가', '회원가입', '구매완료', '구매매출', '신청', 'ROAS',
];

/**
 * 행의 강조 배경.
 *
 * 겹치는 상태가 여러 개일 수 있어서 우선순위가 있다 —
 * 선택 > 미저장 변경(삭제·수정·추가) > 서버 diff(신규·교체) > 줄무늬.
 * 미저장 변경을 diff 보다 위에 두는 이유: 지금 내가 건드린 게 먼저 보여야 한다.
 */
function rowBackground(
  isSelected: boolean,
  pendingStatus: EnrichedRow['pendingStatus'],
  isAdded: boolean,
  isUpdated: boolean,
  index: number,
): string {
  if (isSelected) return 'bg-primary-soft border-l-4 border-l-primary';
  if (pendingStatus === 'deleted') return 'bg-badge-danger-bg border-l-2 border-l-badge-danger-fg';
  if (pendingStatus === 'edited') return 'bg-badge-amber-bg border-l-2 border-l-badge-amber-fg';
  if (pendingStatus === 'added') return 'bg-badge-info-bg border-l-2 border-l-badge-info-fg';
  if (isAdded) return 'bg-badge-success-bg border-l-2 border-l-badge-success-fg';
  if (isUpdated) return 'bg-badge-warn-bg border-l-2 border-l-badge-warn-fg';
  return index % 2 === 0 ? 'tr-even' : 'tr-odd';
}

interface DailyTableProps {
  rows: EnrichedRow[];
  /** 서버가 알려준 이번 업로드의 변경 내역 */
  diff?: RowDiff;
  /** 매체 이름 — 카카오SA 는 전환 지표 열을 빼고 그린다 */
  mediaLabel?: string;
  editable?: boolean;
  onEdit?: (row: MediaDailyRow) => void;
  onDelete?: (date: string) => void;
  onRestoreDelete?: (date: string) => void;
}

/** 매체 하나의 일별 데이터 표. 행을 클릭하면 상세 모달이 열린다 */
export default function DailyTable({
  rows,
  diff,
  mediaLabel,
  editable,
  onEdit,
  onDelete,
  onRestoreDelete,
}: DailyTableProps) {
  const isKakao = mediaLabel === '카카오SA';
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const headers = isKakao ? BASE_HEADERS : [...BASE_HEADERS, ...CONV_HEADERS];

  // 미저장 변경이 걸린 행은 실적이 0이어도 보여야 한다 (방금 추가한 빈 행 등)
  const displayRows = rows.filter((r) => r.pendingStatus !== undefined || hasAnyMetric(r));
  const addedSet = new Set(diff?.added ?? []);
  const updatedSet = new Set(diff?.updated ?? []);

  const selectedRow = selectedDate
    ? (displayRows.find((r) => r.date === selectedDate) ?? null)
    : null;

  return (
    <div className="space-y-3">
      <ScrollableTable hint="옆으로 밀어서 전환·매출 지표를 볼 수 있어요">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-3 py-2 font-medium whitespace-nowrap ${
                    i === 0 ? `${STICKY_CELL} text-left` : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => {
              const isSelected = selectedDate === r.date;
              const status = r.pendingStatus;
              const isAdded = addedSet.has(r.date);
              const isUpdated = updatedSet.has(r.date);
              const muted = status === 'deleted' && !isSelected;

              const values = [
                fmt.num(r.impressions),
                fmt.num(r.clicks),
                fmt.pct(r.ctr),
                fmt.num(r.cpc),
                fmt.won(r.cost),
                ...(isKakao
                  ? []
                  : [
                      fmt.dec(r.total_conv),
                      fmt.pct(r.conv_rate),
                      r.conv_cost > 0 ? fmt.num(r.conv_cost) : '-',
                      fmt.dec(r.signup),
                      fmt.dec(r.purchase),
                      r.revenue > 0 ? fmt.won(r.revenue) : '-',
                      fmt.dec(r.apply),
                      fmt.pct(r.roas),
                    ]),
              ];

              return (
                <tr
                  key={r.date}
                  onClick={() => editable && setSelectedDate((prev) => (prev === r.date ? null : r.date))}
                  className={`${rowBackground(isSelected, status, isAdded, isUpdated, i)}
                    ${editable ? 'cursor-pointer hover:brightness-95 transition-all duration-100' : ''}`}
                >
                  <td
                    className={`px-3 py-2 font-medium whitespace-nowrap ${STICKY_CELL}
                      ${muted ? 'text-fg-subtle line-through' : ''}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {r.date.slice(5)}
                      {status && <PendingBadge type={status} />}
                      {!status && isAdded && <DiffBadge type="added" />}
                      {!status && isUpdated && <DiffBadge type="updated" />}
                      {isSelected && !status && (
                        <span className="ml-auto">
                          <i className="bx bx-chevron-right text-primary text-sm" />
                        </span>
                      )}
                    </span>
                  </td>
                  {values.map((v, ci) => (
                    <td key={ci} className={`${NUM_CELL} ${muted ? 'text-fg-disabled' : ''}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}

            {displayRows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-fg-subtle">
                  {editable ? (
                    <span>
                      데이터 없음 — <span className="text-primary">행 추가</span> 버튼으로 첫 데이터를 입력하세요
                    </span>
                  ) : (
                    '데이터 없음'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollableTable>

      {selectedRow && (
        <RowDetailModal
          row={selectedRow}
          mediaLabel={mediaLabel ?? ''}
          editable={editable ?? false}
          onEdit={() => onEdit?.(selectedRow)}
          onDelete={() => onDelete?.(selectedRow.date)}
          onRestore={() => onRestoreDelete?.(selectedRow.date)}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
