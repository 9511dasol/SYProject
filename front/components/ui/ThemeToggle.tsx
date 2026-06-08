'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

function subscribe() { return () => {}; }
function useIsMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsMounted();

  if (!mounted) {
    return <div className="w-8 h-8 rounded-lg bg-surface-2 animate-pulse" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드' : '다크 모드'}
      className="relative flex items-center justify-center w-8 h-8 rounded-lg
        text-fg-muted hover:text-fg hover:bg-surface-2
        border border-transparent hover:border-border
        transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* 태양 (라이트) */}
      <i
        className={`bx bx-sun text-lg absolute transition-all duration-300
          ${isDark ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'}`}
      />
      {/* 달 (다크) */}
      <i
        className={`bx bx-moon text-lg absolute transition-all duration-300
          ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'}`}
      />
    </button>
  );
}

/* 시스템 연동 3-way 토글 (선택사항) */
export function ThemeToggleCycle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();

  if (!mounted) return <div className="w-8 h-8 rounded-lg bg-surface-2 animate-pulse" />;

  const options: { value: string; icon: string; label: string }[] = [
    { value: 'light', icon: 'bx-sun',    label: '라이트' },
    { value: 'dark',  icon: 'bx-moon',   label: '다크'   },
    { value: 'system',icon: 'bx-desktop',label: '시스템'  },
  ];
  const cur = options.find((o) => o.value === theme) ?? options[2];
  const next = options[(options.indexOf(cur) + 1) % options.length];

  return (
    <button
      onClick={() => setTheme(next.value)}
      aria-label={`${next.label} 모드로 전환`}
      title={`현재: ${cur.label} → ${next.label}로 전환`}
      className="flex items-center justify-center w-8 h-8 rounded-lg
        text-fg-muted hover:text-fg hover:bg-surface-2
        border border-transparent hover:border-border
        transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <i className={`bx ${cur.icon} text-lg`} />
    </button>
  );
}
