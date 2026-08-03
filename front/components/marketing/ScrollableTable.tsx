'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ScrollableTableProps {
  children: React.ReactNode;
  /** 스크롤 컨테이너에 덧붙일 클래스 (예: 'max-h-96 overflow-y-auto') */
  className?: string;
  /** 좁은 화면에서 표 위에 띄우는 안내 문구. 넘칠 때만 보인다. */
  hint?: string;
}

/**
 * 좁은 화면에서 옆으로 밀어 볼 수 있는 표 컨테이너.
 *
 * 표가 실제로 넘칠 때만 안내 문구와 양쪽 끝 그라디언트를 보여준다 — 넘치지 않는
 * 표에까지 "미세요" 라고 하면 오히려 헷갈린다. 끝까지 민 방향의 그라디언트는
 * 사라지므로 더 볼 게 남았는지도 같이 알 수 있다.
 */
export default function ScrollableTable({ children, className = '', hint }: ScrollableTableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px 여유 — 브라우저가 소수점 폭을 반올림해 끝에 닿아도 딱 떨어지지 않는다
    const max = el.scrollWidth - el.clientWidth;
    setOverflowing(max > 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();
    el.addEventListener('scroll', measure, { passive: true });

    // 창 크기·탭 전환·행 추가로 표 폭이 바뀌면 다시 잰다
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.querySelector('table');
    if (table) observer.observe(table);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  return (
    <div className="relative">
      {hint && overflowing && (
        <p className="flex items-center gap-1 mb-1.5 text-[11px] text-slate-400 dark:text-fg-subtle sm:hidden">
          <i className="bx bx-left-right-arrow-alt text-sm" />
          {hint}
        </p>
      )}

      <div ref={ref} className={`overflow-x-auto data-table ${className}`}>
        {children}
      </div>

      {/* 끝단 그라디언트 — 표 위에 얹기만 하므로 클릭·스크롤을 가로막지 않는다 */}
      {overflowing && !atStart && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-xl
            bg-linear-to-r from-black/10 to-transparent dark:from-black/40"
        />
      )}
      {overflowing && !atEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl
            bg-linear-to-l from-black/10 to-transparent dark:from-black/40"
        />
      )}
    </div>
  );
}
