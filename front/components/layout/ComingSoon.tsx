import type { NavItem } from '@/types/navigation';

interface ComingSoonProps {
  item: NavItem;
}

export default function ComingSoon({ item }: ComingSoonProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center text-center gap-6">
      {/* 아이콘 */}
      <div
        className="flex items-center justify-center w-20 h-20 rounded-3xl
          bg-linear-to-br from-blue-50 to-indigo-100 border border-blue-100 shadow-sm"
      >
        <i className={`bx ${item.icon} text-4xl text-blue-500`} />
      </div>

      {/* 배지 */}
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
          bg-amber-100 text-amber-700 tracking-wide"
      >
        <i className="bx bx-time-five text-sm" />
        준비 중
      </span>

      {/* 제목 */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          {item.label}
        </h1>
        {item.description && (
          <p className="text-sm text-slate-500 leading-relaxed max-w-sm">{item.description}</p>
        )}
      </div>

      {/* 구분선 */}
      <div className="w-12 h-px bg-slate-200" />

      <p className="text-xs text-slate-400">
        이 기능은 현재 개발 중입니다. 곧 만나보실 수 있습니다.
      </p>
    </div>
  );
}
