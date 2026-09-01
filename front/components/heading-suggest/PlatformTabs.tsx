'use client';

import type { PlatformFilter } from '@/types/heading';

interface PlatformTabsProps {
  active: PlatformFilter;
  counts: Record<PlatformFilter, number>;
  onChange: (tab: PlatformFilter) => void;
}

const TABS: { key: PlatformFilter; icon: string }[] = [
  { key: '전체',     icon: 'bx-grid-alt'    },
  { key: 'Instagram', icon: 'bx-camera'     },
  { key: 'Blog',      icon: 'bx-edit-alt'   },
  { key: 'YouTube',   icon: 'bx-play-circle' },
];

const ACTIVE_STYLES: Record<PlatformFilter, string> = {
  '전체':      'bg-amber-500 text-white shadow-sm shadow-amber-300 dark:shadow-amber-900',
  Instagram:  'bg-linear-to-r from-pink-500 to-purple-500 text-white shadow-sm shadow-pink-200 dark:shadow-pink-900',
  Blog:       'bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-emerald-900',
  YouTube:    'bg-red-500 text-white shadow-sm shadow-red-200 dark:shadow-red-900',
};

export default function PlatformTabs({ active, counts, onChange }: PlatformTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map(({ key, icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
              isActive
                ? ACTIVE_STYLES[key]
                : 'bg-surface-2 border border-border text-fg-muted hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-600 dark:hover:text-amber-400',
            ].join(' ')}
          >
            <i className={`bx ${icon} text-base`} />
            {key}
            <span
              className={[
                'text-xs font-bold px-1.5 py-0.5 rounded-md',
                isActive ? 'bg-white/25 text-white' : 'bg-surface-3 text-fg-muted',
              ].join(' ')}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
