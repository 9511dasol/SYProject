'use client';

import { groupHistory, sinceText } from '@/lib/imageFilterHistory';
import type { HistoryGroup } from '@/lib/imageFilterHistory';
import { editHistoryImageUrl } from '@/lib/imageFilterClient';
import type { EditPromptRecord } from '@/types/imageFilter';

interface HistoryRailProps {
  /** null 이면 아직 불러오는 중 */
  history: EditPromptRecord[] | null;
  historyError: string | null;
  /** 묶음 하나를 "그때 그 작업"으로 불러온다 — 지시 기록 전체가 넘어간다 */
  onLoadGroup: (group: HistoryGroup) => void;
  /** 지금 스레드로 열려 있는 묶음 — 목록에서 눌린 것이 표시돼야 한다 */
  selectedFilename: string | null;
  /** 앱 사이드바가 접혀 있는가 — 펼쳐져 있으면 자리가 좁아 더 넓은 화면에서만 선다 */
  sidebarCollapsed: boolean;
  disabled: boolean;
}

/**
 * 지난 작업 레일 — DM 의 "대화 목록" 자리다.
 *
 * 첨부 전 화면 가운데에 있던 지난 작업과 같은 데이터지만, 레일은 작업 중에도
 * 옆에 떠 있어 언제든 과거 작업을 이어받을 수 있다.
 *
 * 예전에는 앱 사이드바를 접었을 때만 나타났다. 지금은 늘 서 있되, 사이드바가
 * 펼쳐져 있으면 256px 을 이미 내준 상태라 1400px 이상에서만 선다 — 그보다 좁은
 * 화면에서 목록까지 세우면 캔버스가 400px 아래로 줄어든다.
 */
export default function HistoryRail({
  history,
  historyError,
  onLoadGroup,
  selectedFilename,
  sidebarCollapsed,
  disabled,
}: HistoryRailProps) {
  const groups = history ? groupHistory(history) : null;

  return (
    <aside
      aria-label="지난 작업"
      className={`hidden ${
        sidebarCollapsed ? 'lg:flex' : 'min-[1400px]:flex'
      } w-60 shrink-0 flex-col border-r border-border bg-surface`}
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
            // 프로필 사진 자리 — 가장 최근에 보관된 시안 첫 장. 전부 만료됐으면 아이콘.
            const cover = group.items.find((item) => item.imagesAvailable && item.imageCount > 0);
            return (
              <button
                key={group.filename}
                type="button"
                onClick={() => onLoadGroup(group)}
                disabled={disabled}
                title="누르면 그때의 대화 기록이 열립니다"
                className={[
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  selected
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-300 dark:ring-indigo-700'
                    : 'hover:bg-surface-2',
                ].join(' ')}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editHistoryImageUrl(cover.recordId, 0)}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-full object-cover bg-surface-2 ring-1 ring-border"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 ring-1 ring-border">
                    <i className="bx bx-image-alt text-lg text-indigo-400" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-medium text-fg-body"
                      title={group.filename}
                    >
                      {group.filename}
                    </span>
                    <span className="shrink-0 text-[10px] text-fg-subtle">
                      {sinceText(group.latestAt)}
                    </span>
                  </span>
                  {/* 마지막 지시 한 줄 — 목록만 보고도 "그때 뭘 했는지"가 떠올라야 한다 */}
                  <span className="mt-0.5 block text-[11px] text-fg-muted line-clamp-1">
                    {group.items[0].text}
                  </span>
                  {group.items.length > 1 && (
                    <span className="block text-[10px] text-fg-subtle">
                      지시 {group.items.length}건
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
