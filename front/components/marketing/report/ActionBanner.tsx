'use client';

import type { ActionSuggestion } from './actions';

/** 배너에 제목을 직접 나열할 최대 개수 — 넘으면 "외 N건"으로 접는다 */
const INLINE_TITLES = 3;

/**
 * 요약 탭 맨 위의 "점검 필요 N건" 배너.
 *
 * 액션 제안 카드와 AI 코멘트는 리포트 중간에 있어서 스크롤해야 보인다. 리포트를 연
 * 순간 "손댈 곳이 있는가"를 먼저 알려주고, 누르면 해당 섹션으로 데려간다.
 */
export default function ActionBanner({
  items,
  onJump,
}: {
  items: ActionSuggestion[];
  /** 배너를 누르면 액션 제안 섹션으로 이동시킨다 */
  onJump: () => void;
}) {
  const warns = items.filter((i) => i.severity === 'warn');
  if (warns.length === 0) return null;

  const shown = warns.slice(0, INLINE_TITLES);
  const rest = warns.length - shown.length;

  return (
    <button
      type="button"
      onClick={onJump}
      className="w-full text-left rounded-xl border border-badge-warn-bdr bg-badge-warn-bg px-4 py-3 transition-colors hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-2 text-badge-warn-fg">
        <i className="bx bx-error shrink-0 mt-0.5 text-base" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">점검 필요 {warns.length}건</span>
            <span className="text-xs opacity-80">눌러서 액션 제안 보기</span>
          </div>
          <ul className="space-y-0.5">
            {shown.map((w) => (
              <li key={`${w.metric}-${w.title}`} className="text-xs leading-relaxed flex items-start gap-1.5">
                <i className="bx bx-chevron-right shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0">{w.title}</span>
              </li>
            ))}
            {rest > 0 && <li className="text-xs opacity-80 pl-5">외 {rest}건</li>}
          </ul>
        </div>
        <i className="bx bx-down-arrow-alt shrink-0 mt-0.5 text-base" aria-hidden />
      </div>
    </button>
  );
}
