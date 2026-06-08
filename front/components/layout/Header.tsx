'use client';

import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/config/navigation';
import type { NavItem } from '@/types/navigation';
import ThemeToggle from '@/components/ui/ThemeToggle';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface HeaderProps {
  onMenuClick: () => void;
}

interface BreadcrumbItem {
  groupLabel: string;
  item: NavItem;
}

// ── 현재 경로에 맞는 네비 정보 조회 ───────────────────────────────────────────

function findNavItem(pathname: string): BreadcrumbItem | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const isMatch =
        item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(item.href + '/');
      if (isMatch) {
        return { groupLabel: group.groupLabel ?? '', item };
      }
    }
  }
  return null;
}

// ── 헤더 ──────────────────────────────────────────────────────────────────────

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const match = findNavItem(pathname);

  return (
    <header
      className="sticky top-0 z-20 h-14
        bg-surface/85 backdrop-blur-md
        border-b border-border
        flex items-center px-4 sm:px-6 gap-3"
    >
      {/* 햄버거 버튼 (모바일 전용) */}
      <button
        onClick={onMenuClick}
        aria-label="사이드바 열기"
        className="flex items-center justify-center w-8 h-8 rounded-lg
          text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors lg:hidden shrink-0"
      >
        <i className="bx bx-menu text-xl" />
      </button>

      {/* 브레드크럼 / 페이지 타이틀 */}
      {match ? (
        <div className="flex items-center gap-2 min-w-0">
          {match.groupLabel && (
            <>
              <span className="text-xs text-fg-subtle hidden sm:inline truncate">
                {match.groupLabel}
              </span>
              <i className="bx bx-chevron-right text-fg-subtle text-sm hidden sm:inline shrink-0" />
            </>
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <i className={`bx ${match.item.icon} text-primary text-base shrink-0`} />
            <span className="text-sm font-semibold text-fg truncate">
              {match.item.label}
            </span>
          </div>
        </div>
      ) : (
        <span className="text-sm font-semibold text-fg">마케팅 AI</span>
      )}

      {/* 우측 액션 */}
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
      </div>
    </header>
  );
}
