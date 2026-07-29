'use client';

export interface Period {
  year: number;
  month: number;
}

interface PeriodPickerProps {
  /** DB에 저장된 기간 (최신순) */
  periods: Period[];
  selected: Period | null;
  onSelect: (period: Period) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 연도 탭 + 12개월 그리드로 기간을 고른다.
 *
 * 예전에는 저장된 기간을 전부 한 줄에 나열했는데, 기간이 쌓이면서(현재 19개) 가로로
 * 넘쳐 스크롤하지 않으면 옛 달이 보이지 않았다. 연도를 먼저 좁히면 월은 항상 12칸
 * 고정이라 "5월은 왼쪽에서 다섯 번째"처럼 위치로 찾을 수 있고, 데이터가 없는 달도
 * 빈칸이 아니라 흐린 칸으로 보여 무엇이 비었는지 함께 드러난다.
 *
 * 연도 탭을 누르면 그 해의 가장 최근 달로 바로 이동한다 — 연도만 바꾸고 아무 일도
 * 일어나지 않으면 한 번 더 눌러야 하는지 알기 어렵다. 덕분에 '지금 보고 있는 연도'를
 * 따로 들고 있을 필요가 없어(항상 selected.year) 상태가 어긋날 여지도 없다.
 */
export default function PeriodPicker({ periods, selected, onSelect }: PeriodPickerProps) {
  // 데이터가 있는 연도 + 지금 보고 있는 연도(아직 저장 전인 새 기간일 수 있다)
  const years = Array.from(
    new Set([...periods.map((p) => p.year), ...(selected ? [selected.year] : [])]),
  ).sort((a, b) => b - a);

  const activeYear = selected?.year ?? years[0] ?? null;
  const monthsWithData = new Set(
    periods.filter((p) => p.year === activeYear).map((p) => p.month),
  );
  const selectedIsNew =
    selected !== null &&
    !periods.some((p) => p.year === selected.year && p.month === selected.month);

  function handleYear(year: number) {
    if (year === activeYear) return;
    const latest = periods
      .filter((p) => p.year === year)
      .sort((a, b) => b.month - a.month)[0];
    if (latest) onSelect(latest);
  }

  if (years.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* 연도 — 연 수가 늘어도 줄바꿈 대신 가로 스크롤로 흘린다 */}
      <div
        aria-label="연도"
        className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-0.5 px-0.5"
      >
        {years.map((year) => {
          const count = periods.filter((p) => p.year === year).length;
          const active = year === activeYear;
          return (
            <button
              key={year}
              aria-pressed={active}
              title={`${year}년 — 저장된 기간 ${count}개`}
              onClick={() => handleYear(year)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold
                transition-colors
                ${active
                  ? 'bg-slate-900 dark:bg-fg text-white dark:text-surface'
                  : 'bg-slate-100 dark:bg-surface-3 text-slate-500 dark:text-fg-muted hover:bg-slate-200 dark:hover:bg-surface-3/70'}`}
            >
              {year}년
              <span
                className={`text-[10px] leading-none px-1.5 py-0.5 rounded-full tabular-nums
                  ${active ? 'bg-white/20 dark:bg-surface/25' : 'bg-white dark:bg-surface/60'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 월 — 데이터가 없는 달도 자리를 지켜 위치로 찾을 수 있게 한다 */}
      <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5">
        {MONTHS.map((month) => {
          const isSelected = selected?.year === activeYear && selected?.month === month;
          const hasData = monthsWithData.has(month);
          const isNew = isSelected && selectedIsNew;

          return (
            <button
              key={month}
              onClick={() => activeYear !== null && onSelect({ year: activeYear, month })}
              disabled={!hasData && !isSelected}
              aria-current={isSelected ? 'true' : undefined}
              title={hasData ? `${activeYear}년 ${month}월` : `${activeYear}년 ${month}월 — 저장된 데이터 없음`}
              className={`relative rounded-lg py-1.5 text-xs font-medium tabular-nums transition-colors
                ${isSelected
                  ? 'bg-blue-600 text-white'
                  : hasData
                    ? 'bg-white dark:bg-surface-3 text-slate-600 dark:text-fg-muted border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-3/70'
                    : 'text-slate-300 dark:text-fg-subtle/60 border border-dashed border-slate-200/70 dark:border-border/50 cursor-not-allowed'}`}
            >
              {month}월
              {isNew && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] leading-none px-1 py-0.5 rounded">
                  NEW
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
