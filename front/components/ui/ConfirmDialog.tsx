'use client';

import type { ReactNode } from 'react';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

type Tone = 'danger' | 'warn' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  /** 취소·오버레이·Escape 로 닫을 때 */
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  icon?: string;
  /** 무엇이 일어나는지 — 대상과 범위를 구체적으로 적는다 */
  message: ReactNode;
  /** 되돌릴 수 있는지 등 한 번 더 짚을 내용 */
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** 실행 중 — 모달이 잠기고 확인 버튼이 스피너가 된다 */
  busy?: boolean;
}

const CONFIRM_TONE: Record<Tone, 'danger' | 'amber' | 'brand'> = {
  danger: 'danger',
  warn: 'amber',
  info: 'brand',
};

/**
 * 되돌릴 수 없는 액션 앞에 세우는 확인 단계.
 *
 * 기간 데이터 삭제에는 "되돌릴 수 없습니다" 확인이 있었는데, 정작 외부로 메일을
 * 보내거나 남의 계정을 잠그는 쪽에는 아무 가드도 없었다 — 영향이 큰 액션일수록
 * 가드가 없는 상태였다. 같은 모양의 확인을 한 곳에 모아 두고 전부 여기를 쓴다.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  icon = 'bx-error',
  message,
  detail,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'danger',
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon={icon} size="sm" busy={busy}>
      <div className="space-y-4">
        <Alert tone={tone}>
          <div className="font-medium">{message}</div>
          {detail && <div className="mt-1.5 text-xs opacity-90">{detail}</div>}
        </Alert>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="md" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button tone={CONFIRM_TONE[tone]} size="md" onClick={onConfirm} isLoading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
