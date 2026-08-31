import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface EmptyStateProps {
  /** boxicons 클래스 이름 (예: 'bx-mail-send') */
  icon: string;
  title: string;
  /** 다음에 무엇을 해야 하는지 한 줄 안내 — 있으면 사용자가 막히지 않는다 */
  description?: ReactNode;
  /** 안내에 이어 붙일 버튼·링크 */
  action?: ReactNode;
  className?: string;
}

/**
 * "아직 아무것도 없다"를 보여주는 자리.
 *
 * 관리자 화면들은 `<p>저장된 데이터가 없습니다.</p>` 한 줄로 끝나서, 사용자가
 * 다음에 무엇을 해야 하는지 알 수 없었다. description · action 을 받아 두면
 * 최소한 막다른 길은 되지 않는다.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-16 px-6 text-center',
        className,
      )}
    >
      <span className="flex items-center justify-center w-12 h-12 rounded-full bg-surface-2">
        <i className={`bx ${icon} text-2xl text-fg-subtle`} aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-fg-muted">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-fg-subtle leading-relaxed">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
