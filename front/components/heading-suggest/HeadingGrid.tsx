import type { HeadingItem, PlatformFilter } from '@/types/heading';
import HeadingCard from './HeadingCard';

interface HeadingGridProps {
  headings: HeadingItem[];
  filter: PlatformFilter;
}

/** 로딩 중 스켈레톤 (10장) */
export function HeadingGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 border-l-4 border-l-slate-200 dark:border-l-slate-600 p-5 space-y-3 animate-pulse"
        >
          <div className="h-4 w-20 bg-slate-100 dark:bg-slate-700 rounded-md" />
          <div className="h-5 w-full bg-slate-100 dark:bg-slate-700 rounded-md" />
          <div className="h-4 w-4/5 bg-slate-100 dark:bg-slate-700 rounded-md" />
          <div className="h-3 w-3/5 bg-slate-100 dark:bg-slate-700 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default function HeadingGrid({ headings, filter }: HeadingGridProps) {
  const visible = filter === '전체'
    ? headings
    : headings.filter((h) => h.platform === filter);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-400 dark:text-slate-500">
        <i className="bx bx-search-alt text-4xl" />
        <p className="text-sm">해당 플랫폼의 문구가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {visible.map((item) => (
        <HeadingCard key={item.id} item={item} />
      ))}
    </div>
  );
}
