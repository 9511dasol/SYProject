'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/format';

export default function CommentSection({ text, updatedAt }: { text: string; updatedAt?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const preview = text.slice(0, 120) + (text.length > 120 ? '...' : '');
  return (
    <div className="rounded-xl border border-badge-amber-bdr bg-badge-amber-bg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-badge-amber-fg"
      >
        <span className="flex items-center gap-2">
          <i className="bx bx-comment-detail" />
          코멘트
          {updatedAt && (
            <span className="text-xs font-normal opacity-80">{formatDateTime(updatedAt)} 업데이트</span>
          )}
        </span>
        <i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'}`} />
      </button>
      <div className="px-4 pb-3 text-xs text-badge-amber-fg leading-relaxed whitespace-pre-wrap">
        {open ? text : preview}
      </div>
    </div>
  );
}
