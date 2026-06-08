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
  '전체':      'bg-amber-500 text-white shadow-sm shadow-amber-300',
  Instagram:  'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-sm shadow-pink-200',
  Blog:       'bg-emerald-500 text-white shadow-sm shadow-emerald-200',
  YouTube:    'bg-red-500 text-white shadow-sm shadow-red-200',
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
                : 'bg-white border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600',
            ].join(' ')}
          >
            <i className={`bx ${icon} text-base`} />
            {key}
            <span
              className={[
                'text-xs font-bold px-1.5 py-0.5 rounded-md',
                isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500',
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
