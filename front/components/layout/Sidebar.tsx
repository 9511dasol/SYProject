'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/config/navigation';
import type { NavBadge, NavItem } from '@/types/navigation';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

// ── 배지 스타일 맵 ────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<NavBadge, string> = {
  NEW: 'bg-emerald-100 text-emerald-700',
  SOON: 'bg-slate-100 text-slate-400',
  BETA: 'bg-amber-100 text-amber-700',
};

const BADGE_STYLES_ACTIVE: Record<NavBadge, string> = {
  NEW: 'bg-white/25 text-white',
  SOON: 'bg-white/20 text-white/70',
  BETA: 'bg-white/25 text-white',
};

// ── 개별 네비게이션 아이템 ────────────────────────────────────────────────────

function NavItemRow({
  item,
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose: () => void;
}) {
  const isActive =
    item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(item.href + '/');

  if (item.disabled) {
    return (
      <div
        title={item.description}
        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
          text-slate-400 cursor-not-allowed select-none"
      >
        <i className={`bx ${item.icon} text-[18px] shrink-0`} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-wide
              ${BADGE_STYLES[item.badge]}`}
          >
            {item.badge}
          </span>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClose}
      title={item.description}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
        transition-all duration-150
        ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
    >
      <i
        className={`bx ${item.icon} text-[18px] shrink-0 transition-transform duration-150
          ${isActive ? '' : 'group-hover:scale-110'}`}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-wide
            ${isActive ? BADGE_STYLES_ACTIVE[item.badge] : BADGE_STYLES[item.badge]}`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ── 사이드바 ──────────────────────────────────────────────────────────────────

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* 모바일 딤드 오버레이 */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* 사이드바 본체 */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-slate-200/80
          flex flex-col transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* 로고 영역 */}
        <div className="h-14 px-5 flex items-center gap-3 border-b border-slate-100 shrink-0">
          <span
            className="flex items-center justify-center w-8 h-8 rounded-xl
              bg-linear-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-600/20 shrink-0"
          >
            <i className="bx bx-line-chart text-white text-base" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-tight">마케팅 AI</p>
            <p className="text-[10px] text-slate-400 leading-tight tracking-wide">
              Analytics Platform
            </p>
          </div>

          {/* 모바일 닫기 버튼 */}
          <button
            onClick={onClose}
            aria-label="사이드바 닫기"
            className="ml-auto flex items-center justify-center w-7 h-7 rounded-lg
              text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors lg:hidden"
          >
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-hide">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {group.groupLabel && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-3 mb-1.5">
                  {group.groupLabel}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavItemRow item={item} pathname={pathname} onClose={onClose} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* 하단 */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            © {new Date().getFullYear()} Marketing AI Platform
          </p>
        </div>
      </aside>
    </>
  );
}
