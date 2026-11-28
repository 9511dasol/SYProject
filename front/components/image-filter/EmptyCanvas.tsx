'use client';

import { useMemo, useRef } from 'react';
import { ACCEPTED_IMAGE_HINT } from '@/lib/imageFile';
import { groupHistory, sinceText } from '@/lib/imageFilterHistory';
import { EXAMPLE_PROMPTS } from '@/lib/imageFilterPrompt';
import type { StoredInstruction, StoredSession } from '@/lib/imageFilterStorage';
import type { EditPromptRecord } from '@/types/imageFilter';

interface EmptyCanvasProps {
  onAttach: (file: File) => boolean;
  /** 첨부하면 첫 지시로 등록될 목록 (예시 선택 · 저장소 복구 · 지난 작업 선택) */
  seed: StoredInstruction[];
  onSeed: (next: StoredInstruction[]) => void;
  /** 되살릴 수 있는 지난 지시 — 없으면 null */
  restorable: StoredSession | null;
  onRestore: () => void;
  onDiscardRestore: () => void;
  /** 서버에 남은 내 편집 기록 — null 이면 아직 불러오는 중 */
  history: EditPromptRecord[] | null;
  historyError: string | null;
  /** 지난 작업은 왼쪽 레일이 맡는다 — 레일이 서는 폭부터 이 블록을 숨긴다.
   *  사이드바가 접혀 있으면 lg, 펼쳐져 있으면 1400px 부터다 (HistoryRail 과 같은 기준) */
  sidebarCollapsed: boolean;
  error: string | null;
}

/* ── 이미지를 올리기 전 첫 화면 ── */

export default function EmptyCanvas({
  onAttach,
  seed,
  onSeed,
  restorable,
  onRestore,
  onDiscardRestore,
  history,
  historyError,
  sidebarCollapsed,
  error,
}: EmptyCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hideWhenRail = sidebarCollapsed ? 'lg:hidden' : 'min-[1400px]:hidden';
  const historyGroups = useMemo(() => (history ? groupHistory(history) : null), [history]);

  return (
    /* 바깥이 스크롤, 안쪽이 중앙 정렬 — 상위 레이아웃이 화면 높이에 잠겨 있어
       (lg:overflow-hidden) 이 안에서 스크롤을 만들어야 한다. 정렬을 바깥에 두면
       내용이 길어졌을 때 justify-center 가 위쪽을 화면 밖으로 밀어 버려 스크롤로도
       닿을 수 없다 — 지난 작업 목록이 생기면서 실제로 겪은 문제다. 안쪽에
       min-h-full 을 주면 짧을 땐 중앙, 길어지면 그냥 위에서부터 흐른다. */
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-950">
        <i className="bx bxs-magic-wand text-3xl text-white" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
          무엇을 어떻게 바꿔볼까요?
        </h2>
        <p className="text-sm text-fg-muted max-w-md mx-auto leading-relaxed">
          이미지를 올리고 대화하듯 지시를 적어 보내세요. 오른쪽 캔버스에서 수정할 부분만
          골라 지시할 수도 있어요.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-badge-danger-bdr bg-badge-danger-bg px-3.5 py-2.5 text-xs text-badge-danger-fg">
          <i className="bx bx-error-circle text-base shrink-0" />
          {error}
        </p>
      )}

      {/* ── 지난 지시 복구 ──
          이미지는 저장하지 않으므로(서버에 저장하지 않는다는 약속과 같은 이유)
          지시만 되살리고 이미지는 다시 받는다. */}
      {restorable && (
        <div className="w-full max-w-lg rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/40 px-4 py-3.5 text-left">
          <p className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            <i className="bx bx-history text-base shrink-0" />
            이전에 쓰던 지시 {restorable.instructions.length}건이 있어요
          </p>
          <p className="mt-1 text-[11px] text-indigo-600/80 dark:text-indigo-400/80 leading-relaxed">
            {restorable.imageName && (
              <>
                <span className="font-medium">{restorable.imageName}</span> ·{' '}
              </>
            )}
            {sinceText(restorable.savedAt)} 저장 · 이미지는 저장하지 않아 다시 첨부해야 해요
          </p>

          <ul className="mt-2 space-y-1">
            {restorable.instructions.slice(0, 3).map((item, index) => (
              <li
                key={`${item.text}-${index}`}
                className="flex items-start gap-1.5 text-xs text-fg-muted"
              >
                <i className="bx bx-chevron-right text-sm shrink-0 text-indigo-400 mt-px" />
                <span className="line-clamp-1">
                  {item.targetHint && (
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                      {item.targetHint}:{' '}
                    </span>
                  )}
                  {item.text}
                </span>
              </li>
            ))}
            {restorable.instructions.length > 3 && (
              <li className="text-[11px] text-fg-subtle pl-5">
                외 {restorable.instructions.length - 3}건
              </li>
            )}
          </ul>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
            >
              <i className="bx bx-undo text-base" />
              불러오기
            </button>
            <button
              type="button"
              onClick={onDiscardRestore}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
            >
              버리기
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group flex items-center gap-3 rounded-2xl border-2 border-dashed border-border hover:border-indigo-300 dark:hover:border-indigo-700 bg-surface hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 px-6 py-4 transition-all"
      >
        <i className="bx bx-cloud-upload text-2xl text-indigo-400 group-hover:scale-110 transition-transform" />
        <span className="text-left">
          <span className="block text-sm font-semibold text-fg-body">
            이미지를 올리거나 여기로 드래그
          </span>
          <span className="block text-xs text-fg-subtle mt-0.5">
            {ACCEPTED_IMAGE_HINT} · 붙여넣기(Ctrl+V)도 돼요
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onAttach(picked);
          e.target.value = '';
        }}
      />

      {/* 복구로 들어온 지시는 목록으로 보여 준다 — 예시 선택과 달리 여러 건이다 */}
      {seed.length > 1 ? (
        <div className="w-full max-w-lg space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-fg-subtle uppercase tracking-wider">
            <i className="bx bx-check-circle text-sm text-emerald-500" />
            첨부하면 아래 {seed.length}건이 등록돼요
          </p>
          <ul className="space-y-1.5 text-left">
            {seed.map((item, index) => (
              <li
                key={`${item.text}-${index}`}
                className="flex items-start gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5"
              >
                <i className="bx bx-message-square-edit text-base shrink-0 text-indigo-400 mt-px" />
                <span className="flex-1 text-xs text-fg-muted leading-relaxed">
                  {item.targetHint && (
                    <span className="font-medium text-badge-warn-fg">
                      [{item.targetHint} — 대상 다시 선택 필요]{' '}
                    </span>
                  )}
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() => onSeed(seed.filter((_, i) => i !== index))}
                  aria-label="이 지시 빼기"
                  className="shrink-0 text-fg-subtle hover:text-red-500 transition-colors"
                >
                  <i className="bx bx-x text-base block" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-2">
          <p className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider">
            {seed.length === 1 ? '첨부하면 이 지시가 첫 번째로 등록돼요' : '이런 것도 할 수 있어요'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLE_PROMPTS.map((example) => {
              const picked = seed.length === 1 && seed[0].text === example.text;
              return (
                <button
                  key={example.text}
                  type="button"
                  onClick={() => onSeed(picked ? [] : [{ text: example.text }])}
                  className={[
                    'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    picked
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40'
                      : 'border-border bg-surface hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30',
                  ].join(' ')}
                >
                  <i
                    className={`bx ${picked ? 'bxs-check-circle' : example.icon} text-lg shrink-0 ${
                      picked ? 'text-indigo-500' : 'text-indigo-400'
                    }`}
                  />
                  <span
                    className={`text-xs sm:text-sm leading-snug ${
                      picked ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 'text-fg-muted'
                    }`}
                  >
                    {example.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 지난 작업 — 서버에 남은 내 편집 기록을 이미지별 "대화"로 보여 준다.
          이 화면은 새로고침하면 작업 내역이 사라지는 곳이라, 돌아온 사람이
          "지난번에 뭐라고 시켰더라"를 여기서 바로 찾아 이어 갈 수 있어야 한다. */}
      {/* 레일이 서는 폭에서만 숨긴다 — 그보다 좁은 화면에서 둘 다 사라지면
          기록을 볼 곳이 없어진다 */}
      {historyError && (
        <p className={`text-[11px] text-amber-600 dark:text-amber-400 ${hideWhenRail}`}>
          {historyError}
        </p>
      )}
      {historyGroups !== null && historyGroups.length > 0 && (
        <div className={`w-full max-w-2xl space-y-2 text-left ${hideWhenRail}`}>
          <p className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-fg-subtle uppercase tracking-wider">
            <i className="bx bx-history text-sm" />
            지난 작업 — 지시를 누르면 첨부할 때 그대로 이어져요
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {historyGroups.slice(0, 4).map((group) => (
              <div
                key={group.key}
                className="rounded-xl border border-border bg-surface px-3.5 py-3 space-y-1.5"
              >
                <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                  <i className="bx bx-image-alt text-sm shrink-0" />
                  <span className="truncate font-medium text-fg-muted" title={group.filename}>
                    {group.filename}
                  </span>
                  <span className="shrink-0">· {sinceText(group.latestAt)}</span>
                  {group.items.length > 1 && (
                    <span className="shrink-0">· 지시 {group.items.length}건</span>
                  )}
                </p>
                <ul className="space-y-1">
                  {group.items.slice(0, 3).map(({ text: prompt }, index) => {
                    const picked = seed.length === 1 && seed[0].text === prompt;
                    return (
                      <li key={`${prompt}-${index}`}>
                        <button
                          type="button"
                          onClick={() => onSeed(picked ? [] : [{ text: prompt }])}
                          title={picked ? '선택 해제' : '첨부하면 이 지시가 첫 번째로 등록돼요'}
                          className={[
                            'flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                            picked
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                              : 'text-fg-muted hover:bg-surface-2',
                          ].join(' ')}
                        >
                          <i
                            className={`bx ${picked ? 'bxs-check-circle' : 'bx-chevron-right'} text-sm shrink-0 mt-px ${
                              picked ? 'text-indigo-500' : 'text-fg-subtle'
                            }`}
                          />
                          <span className="line-clamp-2">{prompt}</span>
                        </button>
                      </li>
                    );
                  })}
                  {group.items.length > 3 && (
                    <li className="pl-7 text-[11px] text-fg-subtle">
                      외 {group.items.length - 3}건
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
