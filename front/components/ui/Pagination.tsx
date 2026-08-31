'use client';

interface PaginationProps {
  /** 전체 항목 수 (서버가 준 total) */
  total: number;
  pageSize: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
}

/**
 * offset 기반 페이지 이동.
 *
 * 아래 계산과 이전/다음 버튼 20줄이 관리자 화면 두 곳에 글자 단위로 같이 있었다.
 * 한 페이지밖에 없으면 아무것도 그리지 않는다.
 */
export default function Pagination({ total, pageSize, offset, onOffsetChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;

  if (totalPages <= 1) return null;

  const buttonClass =
    'px-3 py-1.5 rounded-lg border border-border hover:bg-surface-2 transition-colors ' +
    'disabled:opacity-40 disabled:cursor-not-allowed ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <nav
      aria-label="페이지 이동"
      className="flex items-center justify-center gap-3 text-sm text-fg-subtle"
    >
      <button
        type="button"
        onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
        disabled={currentPage <= 1}
        className={buttonClass}
      >
        이전
      </button>
      {/* aria-live — 페이지를 넘겼을 때 스크린리더가 위치 변화를 읽어 준다 */}
      <span aria-live="polite" className="tabular-nums">
        {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onOffsetChange(offset + pageSize)}
        disabled={currentPage >= totalPages}
        className={buttonClass}
      >
        다음
      </button>
    </nav>
  );
}
