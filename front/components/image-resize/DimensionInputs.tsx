'use client';

import type { ChangeEvent } from 'react';
import type { DimensionInputsProps } from '@/types/imageResize';

export default function DimensionInputs({
  targetWidth,
  targetHeight,
  keepAspectRatio,
  originalDimensions,
  onWidthChange,
  onHeightChange,
  onToggleAspectRatio,
  disabled = false,
}: DimensionInputsProps) {
  const inputCls = [
    'w-full rounded-xl border px-4 py-3 text-sm font-mono',
    'text-fg',
    'bg-surface-2',
    'border-border',
    'hover:border-violet-200 dark:hover:border-violet-700',
    'focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400 dark:focus:border-violet-600',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    'transition-colors placeholder:text-fg-subtle',
  ].join(' ');

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        {/* 가로 */}
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-fg-muted flex items-center gap-1.5">
            <i className="bx bx-expand-horizontal text-sm text-fg-subtle" />
            가로 (px)
          </label>
          <input
            type="number"
            min={1}
            max={99999}
            value={targetWidth}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onWidthChange(e.target.value)}
            className={inputCls}
            placeholder="Width"
            disabled={disabled}
          />
        </div>

        {/* 비율 잠금 토글 */}
        <div className="flex flex-col items-center gap-0.5 pb-1">
          <div
            className={`w-px h-3 transition-colors ${
              keepAspectRatio ? 'bg-violet-300 dark:bg-violet-600' : 'bg-surface-3'
            }`}
          />
          <button
            type="button"
            onClick={onToggleAspectRatio}
            disabled={disabled}
            title={keepAspectRatio ? '비율 고정 해제' : '비율 고정'}
            className={[
              'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
              keepAspectRatio
                ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900 ring-1 ring-violet-200 dark:ring-violet-800'
                : 'bg-surface-3 text-fg-subtle hover:bg-surface-3',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            <i className={`bx ${keepAspectRatio ? 'bx-link' : 'bx-unlink'} text-lg`} />
          </button>
          <div
            className={`w-px h-3 transition-colors ${
              keepAspectRatio ? 'bg-violet-300 dark:bg-violet-600' : 'bg-surface-3'
            }`}
          />
        </div>

        {/* 세로 */}
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-fg-muted flex items-center gap-1.5">
            <i className="bx bx-expand-vertical text-sm text-fg-subtle" />
            세로 (px)
          </label>
          <input
            type="number"
            min={1}
            max={99999}
            value={targetHeight}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onHeightChange(e.target.value)}
            className={inputCls}
            placeholder="Height"
            disabled={disabled}
          />
        </div>
      </div>

      {/* 비율 상태 표시 */}
      <p className="text-xs text-fg-subtle flex items-center gap-1.5">
        <i
          className={`bx text-sm ${
            keepAspectRatio ? 'bx-lock-alt text-violet-400 dark:text-violet-500' : 'bx-lock-open-alt'
          }`}
        />
        {keepAspectRatio
          ? `비율 고정 · 원본 ${originalDimensions.width} × ${originalDimensions.height} px`
          : '자유 비율 — 가로·세로 독립 조절'}
      </p>
    </div>
  );
}
