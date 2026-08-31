import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { EnrichedRow } from '@/hooks/usePendingRows';
import { MetricItem, PendingBadge } from './Badges';
import { fmt } from './shared';

interface RowDetailModalProps {
  row: EnrichedRow;
  /** 매체 이름 — 카카오SA 는 전환 지표를 받지 않는다 */
  mediaLabel: string;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onClose: () => void;
}

/** 표에서 행을 클릭했을 때 지표 전체를 보여주는 모달 */
export default function RowDetailModal({
  row,
  mediaLabel,
  editable,
  onEdit,
  onDelete,
  onRestore,
  onClose,
}: RowDetailModalProps) {
  const isKakao = mediaLabel === '카카오SA';
  const status = row.pendingStatus;
  const isDeleted = status === 'deleted';

  return (
    <Modal
      open
      onClose={onClose}
      icon="bx-calendar"
      title={
        <>
          <span className="truncate">{row.date}</span>
          <span className="text-xs font-normal text-fg-subtle shrink-0">{mediaLabel}</span>
          {status && <PendingBadge type={status} />}
        </>
      }
      footer={
        editable ? (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-[11px] text-fg-subtle">
              {isDeleted
                ? '삭제 예정 — DB 저장 전까지 되돌릴 수 있습니다'
                : '행 데이터를 수정하거나 삭제할 수 있습니다'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {isDeleted ? (
                <Button variant="outline" size="sm" onClick={onRestore}>
                  <i className="bx bx-undo text-sm" />
                  삭제 취소
                </Button>
              ) : (
                <>
                  <Button variant="ghost" tone="danger" size="sm" onClick={onDelete}>
                    <i className="bx bx-trash text-sm" />
                    삭제
                  </Button>
                  <Button size="sm" onClick={onEdit}>
                    <i className="bx bx-pencil text-sm" />
                    수정
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className={`space-y-3 ${isDeleted ? 'opacity-50' : ''}`}>
        {/* 기본 지표 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MetricItem label="노출수" value={fmt.num(row.impressions)} />
          <MetricItem label="클릭수" value={fmt.num(row.clicks)} />
          <MetricItem label="CTR" value={fmt.pct(row.ctr)} />
          <MetricItem label="CPC" value={fmt.won(row.cpc)} />
          <MetricItem label="광고비" value={fmt.won(row.cost)} />
        </div>

        {/* 전환 지표 (카카오SA 제외) */}
        {!isKakao && (
          <>
            <div className="flex items-center gap-2 py-0.5">
              <div className="h-px flex-1 bg-border-soft" />
              <span className="text-[10px] font-semibold text-fg-subtle uppercase tracking-widest">
                전환
              </span>
              <div className="h-px flex-1 bg-border-soft" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricItem label="전환수" value={fmt.dec(row.total_conv)} />
              <MetricItem label="전환율" value={fmt.pct(row.conv_rate)} />
              <MetricItem label="전환단가" value={row.conv_cost > 0 ? fmt.won(row.conv_cost) : '-'} />
              <MetricItem label="ROAS" value={fmt.pct(row.roas)} />
              <MetricItem label="회원가입" value={fmt.dec(row.signup)} />
              <MetricItem label="구매완료" value={fmt.dec(row.purchase)} />
              <MetricItem label="구매매출" value={row.revenue > 0 ? fmt.won(row.revenue) : '-'} />
              <MetricItem label="신청" value={fmt.dec(row.apply)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
