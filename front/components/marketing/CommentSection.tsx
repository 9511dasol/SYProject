'use client';

import { useState } from 'react';

export default function CommentSection({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const preview = text.slice(0, 120) + (text.length > 120 ? '...' : '');
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-amber-800"
      >
        <span className="flex items-center gap-2">
          <i className="bx bx-comment-detail text-amber-500" />
          코멘트
        </span>
        <i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'} text-amber-500`} />
      </button>
      <div className="px-4 pb-3 text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">
        {open ? text : preview}
      </div>
    </div>
  );
}
