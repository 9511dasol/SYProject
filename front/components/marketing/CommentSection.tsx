'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/format';

/**
 * AI 코멘트 박스.
 *
 * 예전에는 항상 접힌 채로 리포트 맨 아래에 있었다 — 담당자가 "무슨 액션을 취해야
 * 하는지"를 가장 늦게 알게 되는 자리였다. 지금은 위로 올라왔고 기본으로 펼친다.
 */
export default function CommentSection({
  text,
  updatedAt,
  updatedLabel = '업데이트',
  defaultOpen = true,
}: {
  text: string;
  /** ISO 문자열 또는 epoch 밀리초 */
  updatedAt?: string | number | null;
  /**
   * 시각 뒤에 붙는 말. 출처가 다르면 바꾼다 — DB 리포트는 서버가 기록한 갱신 시각이지만,
   * 가져온 엑셀은 파일의 수정 시각이라 "업데이트"라고 하면 거짓이 된다.
   */
  updatedLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
            <span className="text-xs font-normal opacity-80">
              {formatDateTime(updatedAt)} {updatedLabel}
            </span>
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
