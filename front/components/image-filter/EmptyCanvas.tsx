'use client';

import { useRef } from 'react';
import { ACCEPTED_IMAGE_HINT } from '@/lib/imageFile';
import { EXAMPLE_PROMPTS } from '@/lib/imageFilterPrompt';
import type { StoredInstruction, StoredSession } from '@/lib/imageFilterStorage';

interface EmptyCanvasProps {
  onAttach: (file: File) => boolean;
  /** 첨부하면 첫 지시로 등록될 목록 (예시 선택 · 저장소 복구) */
  seed: StoredInstruction[];
  onSeed: (next: StoredInstruction[]) => void;
  /** 되살릴 수 있는 지난 지시 — 없으면 null */
  restorable: StoredSession | null;
  onRestore: () => void;
  onDiscardRestore: () => void;
  error: string | null;
}

/** "3시간 전" 처럼 읽기 — 저장 시각만 보여 주면 언제였는지 가늠이 안 된다 */
function sinceText(savedAt: number): string {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

/* ── 이미지를 올리기 전 첫 화면 ── */

export default function EmptyCanvas({
  onAttach,
  seed,
  onSeed,
  restorable,
  onRestore,
  onDiscardRestore,
  error,
}: EmptyCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-950">
        <i className="bx bxs-magic-wand text-3xl text-white" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
          무엇을 어떻게 바꿔볼까요?
        </h2>
        <p className="text-sm text-fg-muted max-w-md mx-auto leading-relaxed">
          이미지를 올리면 왼쪽 캔버스에서 수정할 부분을 고르고, 오른쪽에 지시를 적어 한 번에
          적용합니다.
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
    </div>
  );
}
