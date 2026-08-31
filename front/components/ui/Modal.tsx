'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * 제목. 배지처럼 짧은 요소를 함께 넣을 수 있다 —
   * aria-labelledby 가 이 요소를 가리키므로 안의 텍스트가 모달 이름이 된다.
   */
  title: ReactNode;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  /** 본문 아래 고정 액션 영역. 스크롤되지 않고 항상 보인다 */
  footer?: ReactNode;
  /**
   * 진행 중인 작업이 있어 닫으면 안 되는 상태.
   * Escape · 오버레이 클릭 · 닫기 버튼이 모두 잠긴다.
   */
  busy?: boolean;
  children: ReactNode;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/** Tab 순환에 넣을 요소. 순서는 DOM 순서를 그대로 따른다 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({
  open,
  onClose,
  title,
  icon,
  size = 'md',
  footer,
  busy = false,
  children,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 열기 전에 포커스가 있던 요소 — 닫을 때 여기로 되돌린다
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  // ── 포커스 이동 · 복원 ────────────────────────────────────────────────────
  // 모달을 열면 포커스가 여전히 뒤쪽 트리거 버튼에 남아 있어서, 키보드 사용자는
  // Tab을 눌러도 모달로 들어오지 못하고 배경 요소들을 계속 훑게 된다.
  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    // 첫 입력칸으로 바로 넣어 준다. 없으면 패널 자체(tabIndex=-1)를 잡는다.
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    return () => {
      // 트리거가 사라진 경우(행 삭제 후 모달 닫기 등)에는 되돌릴 곳이 없다
      if (restoreRef.current?.isConnected) restoreRef.current.focus();
    };
  }, [open]);

  // ── 배경 스크롤 잠금 ──────────────────────────────────────────────────────
  // 모바일에서 특히 문제였다 — 모달 위에서 스크롤하면 뒤 페이지가 밀려 올라갔다.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // ── 키보드: Escape 닫기 + Tab 순환 ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Tab이 모달 밖으로 새면 배경 폼을 조작할 수 있게 된다 — 안에서 돌린다.
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items?.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4
        bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === overlayRef.current && requestClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'w-full flex flex-col max-h-[90vh]',
          SIZES[size],
          'rounded-2xl bg-surface border border-border shadow-overlay',
          'overflow-hidden focus:outline-none',
        )}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <i className={`bx ${icon} text-primary text-xl shrink-0`} />}
            <h2 id={titleId} className="font-semibold text-fg truncate flex items-center gap-2 min-w-0">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="text-fg-subtle hover:text-fg transition-colors p-1 rounded-lg
              hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none shrink-0"
            aria-label="닫기"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>

        {/* 본문 — 길어지면 여기만 스크롤된다 */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-4
              border-t border-border-soft bg-surface-2/60 shrink-0"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
