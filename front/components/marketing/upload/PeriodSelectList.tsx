'use client';

import type { ExcelReport } from '@/types/marketing';

interface PeriodSelectListProps {
  reports: ExcelReport[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** 그 기간에 이미 DB 데이터가 있는지 — '기존 있음' 표시용 */
  hasExistingData: (period: string) => boolean;
}

/**
 * 엑셀 파일에 담긴 기간 목록에서 저장할 달을 고른다.
 *
 * 한 파일에 17개 기간까지 들어온 적이 있어서 목록만 스크롤시킨다 — 모달 전체가
 * 늘어나면 아래 저장 버튼이 화면 밖으로 밀린다.
 */
export default function PeriodSelectList({
  reports,
  selected,
  onChange,
  hasExistingData,
}: PeriodSelectListProps) {
  const allSelected = selected.length === reports.length;

  const toggle = (period: string) => {
    onChange(
      selected.includes(period)
        ? selected.filter((p) => p !== period)
        : [...selected, period],
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <p className="text-xs font-semibold text-fg">
          저장할 기간
          <span className="ml-1.5 font-normal text-fg-subtle">
            {reports.length}개 중 {selected.length}개 선택
          </span>
        </p>
        {reports.length > 1 && (
          <button
            type="button"
            onClick={() => onChange(allSelected ? [] : reports.map((r) => r.period))}
            className="text-xs font-medium text-primary hover:brightness-110"
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto -mx-1 px-1 grid sm:grid-cols-2 gap-1.5">
        {reports.map((r) => {
          const checked = selected.includes(r.period);
          const exists = hasExistingData(r.period);
          return (
            <label
              key={r.period}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-colors
                ${checked
                  ? 'border-primary/60 bg-primary-soft/50 dark:bg-primary-soft/15'
                  : 'border-border bg-surface hover:border-fg-subtle/40'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(r.period)}
                className="w-3.5 h-3.5 rounded accent-primary"
              />
              <span className="font-semibold text-fg">{r.period}</span>
              <span className="text-fg-subtle tabular-nums">{r.daily_total.length}일</span>
              {exists && (
                <span
                  className="ml-auto text-[10px] font-medium text-badge-warn-fg"
                  title="DB에 이미 이 기간의 데이터가 있습니다"
                >
                  기존 있음
                </span>
              )}
            </label>
          );
        })}
      </div>
    </>
  );
}
