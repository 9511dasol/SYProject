'use client';

interface MetricToggleProps<K extends string> {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** 스크린리더용 그룹 이름 — 한 화면에 토글이 여럿이라 어느 차트의 것인지 알려준다 */
  label: string;
}

/**
 * 차트 위의 지표 선택 알약 버튼.
 *
 * radiogroup 으로 노출한다 — 버튼 여러 개로 두면 스크린리더가 "지금 무엇이 선택돼
 * 있는지"를 읽어 주지 못한다. 방향키 이동은 브라우저 기본 동작이 없어서 직접 넣는다.
 */
export default function MetricToggle<K extends string>({
  options,
  value,
  onChange,
  label,
}: MetricToggleProps<K>) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
      : 0;
    if (delta === 0) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.key === value);
    onChange(options[(i + delta + options.length) % options.length].key);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="flex items-center gap-0.5 rounded-lg bg-surface-2 border border-border p-0.5"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            // 선택된 것만 탭 순서에 남긴다 — radiogroup 안은 방향키로 옮긴다
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-fg'
                : 'text-fg-muted hover:bg-surface-3'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
