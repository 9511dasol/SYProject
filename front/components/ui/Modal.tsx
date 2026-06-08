'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  size?: 'md' | 'lg';
  children: ReactNode;
}

export default function Modal({ open, onClose, title, icon, size = 'md', children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        className={`w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'}
          rounded-2xl bg-surface border border-border
          shadow-lg dark:shadow-black/50
          overflow-hidden`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2">
            {icon && <i className={`bx ${icon} text-primary text-xl`} />}
            <span className="font-semibold text-fg">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg transition-colors p-1 rounded-lg hover:bg-surface-2"
            aria-label="닫기"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>
        {/* 본문 */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
