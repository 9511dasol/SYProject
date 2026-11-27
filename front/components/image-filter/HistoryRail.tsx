'use client';

import { groupHistory, sinceText } from '@/lib/imageFilterHistory';
import type { HistoryGroup } from '@/lib/imageFilterHistory';
import type { EditPromptRecord } from '@/types/imageFilter';

interface HistoryRailProps {
  /** null 이면 아직 불러오는 중 */
  history: EditPromptRecord[] | null;
  historyError: string | null;
  /** 묶음 하나를 "그때 그 작업"으로 불러온다 — 지시 기록 전체가 넘어간다 */
  onLoadGroup: (group: HistoryGroup) => void;
  /** 지금 스레드로 열려 있는 묶음 — 목록에서 눌린 것이 표시돼야 한다 */
  selectedFilename: string | null;
  disabled: boolean;
}

/**
 * 지난 작업 레일 — 앱 사이드바를 접었을 때만 그 자리에 나타난다.
 *
 * 접으면 왼쪽 256px 이 비는데, 그 공간을 캔버스에만 돌려주는 대신 "대화 목록"
 * 자리로 쓴다. 첨부 전 화면 가운데에 있던 지난 작업과 같은 데이터지만, 레일은
 * 작업 중에도 옆에 떠 있어 언제든 과거 작업을 이어받을 수 있다.
 *
 * 펼친 상태에서는 그리지 않는다(부모가 조건부 렌더) — 내비게이션과 작업 기록이
 * 양쪽에 동시에 서 있으면 왼쪽이 두 겹이 된다.
 */
export default function HistoryRail({
  history,
  historyError,
  onLoadGroup,
  selectedFilename,
  disabled,
}: HistoryRailProps) {
  const groups = history ? groupHistory(history) : null;

  return (
    <aside
      aria-label="지난 작업"
      className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      <p className="flex items-center gap-1.5 px-4 h-11 shrink-0 border-b border-border-soft text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
        <i className="bx bx-history text-sm" />
        지난 작업
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {historyError && (
          <p className="px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
            {historyError}
          </p>
        )}

        {groups === null ? (
          <p className="px-2 py-1 text-[11px] text-fg-subtle">불러오는 중…</p>
        ) : !groups.length ? (
          <p className="px-2 py-1 text-[11px] text-fg-subtle leading-relaxed">
            아직 보낸 지시가 없어요.
            <br />
            작업을 전송하면 여기에 쌓입니다.
          </p>
        ) : (
          groups.map((group) => {
            const selected = group.filename === selectedFilename;
            return (
              <button
                key={group.filename}
                type="button"
                onClick={() => onLoadGroup(group)}
                disabled={disabled}
                title="누르면 그때의 대화 기록이 열립니다"
                className={[
                  'w-full rounded-xl px-2.5 py-2 text-left transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  selected
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-300 dark:ring-indigo-700'
                    : 'hover:bg-surface-2',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-fg-body">
                  <i className="bx bx-image-alt text-sm shrink-0 text-indigo-400" />
                  <span className="truncate" title={group.filename}>
                    {group.filename}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] text-fg-subtle">
                  {sinceText(group.latestAt)} · 지시 {group.items.length}건
                </span>
                {/* 첫 지시 한 줄 — 목록만 보고도 "그때 뭘 했는지"가 떠올라야 한다 */}
                <span className="mt-0.5 block text-[11px] text-fg-muted line-clamp-1">
                  {group.items[0].text}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
