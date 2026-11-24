import type { ReactNode } from 'react';

interface BrowserFrameProps {
  /** 상단 바에 보여줄 화면 이름 */
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * 목업을 '제품 화면'처럼 보이게 하는 창 프레임.
 * 안의 수치는 전부 허구이므로 우상단에 '예시 데이터' 배지를 항상 단다 —
 * 랜딩의 숫자가 실측치로 오해되면 안 된다.
 */
export default function BrowserFrame({ title, children, className = '' }: BrowserFrameProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-raised overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-1.5 px-4 h-9 border-b border-border bg-surface-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" aria-hidden />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" aria-hidden />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" aria-hidden />
        {title && (
          <span className="ml-2 text-[11px] font-medium text-fg-subtle truncate">{title}</span>
        )}
        <span className="badge badge-neutral ml-auto shrink-0">예시 데이터</span>
      </div>
      {children}
    </div>
  );
}
