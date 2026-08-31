import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'danger' | 'warn' | 'info' | 'success';

interface AlertProps {
  tone?: Tone;
  /** 아이콘을 붙인다. 문장만 있는 좁은 자리에서는 끌 수 있다 */
  icon?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * 인라인 안내·오류 배너.
 *
 * 아래 클래스 뭉치가 6개 파일에 11번 글자 단위로 복붙돼 있었다:
 *   rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
 *   dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400
 * --badge-danger-* 토큰이 이미 같은 색을 갖고 있는데도 쓰이지 않았다.
 *
 * 오류는 role="alert" 로 내보내 스크린리더가 즉시 읽게 한다 — 예전 배너들은
 * 그냥 <div> 였고, 특히 로그인 실패 메시지를 스크린리더가 알리지 못했다.
 */

const TONES: Record<Tone, { box: string; icon: string; role: 'alert' | 'status' }> = {
  danger: {
    box: 'bg-badge-danger-bg border-badge-danger-bdr text-badge-danger-fg',
    icon: 'bx-error-circle',
    role: 'alert',
  },
  warn: {
    box: 'bg-badge-warn-bg border-badge-warn-bdr text-badge-warn-fg',
    icon: 'bx-error',
    role: 'alert',
  },
  info: {
    box: 'bg-badge-info-bg border-badge-info-bdr text-badge-info-fg',
    icon: 'bx-info-circle',
    role: 'status',
  },
  success: {
    box: 'bg-badge-success-bg border-badge-success-bdr text-badge-success-fg',
    icon: 'bx-check-circle',
    role: 'status',
  },
};

export default function Alert({ tone = 'danger', icon = true, className, children }: AlertProps) {
  const t = TONES[tone];
  return (
    <div
      role={t.role}
      className={cx(
        'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm leading-relaxed',
        t.box,
        className,
      )}
    >
      {icon && <i className={`bx ${t.icon} shrink-0 mt-0.5 text-base`} aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
