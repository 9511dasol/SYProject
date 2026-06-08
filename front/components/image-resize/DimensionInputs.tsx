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
    'w-full rounded-xl border px-4 py-3 text-sm font-mono text-slate-800',
    'focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400',
    'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
    'transition-colors placeholder:text-slate-300',
    'border-slate-200 bg-white hover:border-violet-200',
  ].join(' ');

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        {/* 가로 */}
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <i className="bx bx-expand-horizontal text-sm text-slate-400" />
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
              keepAspectRatio ? 'bg-violet-300' : 'bg-slate-200'
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
                ? 'bg-violet-100 text-violet-600 hover:bg-violet-200 ring-1 ring-violet-200'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            <i className={`bx ${keepAspectRatio ? 'bx-link' : 'bx-unlink'} text-lg`} />
          </button>
          <div
            className={`w-px h-3 transition-colors ${
              keepAspectRatio ? 'bg-violet-300' : 'bg-slate-200'
            }`}
          />
        </div>

        {/* 세로 */}
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <i className="bx bx-expand-vertical text-sm text-slate-400" />
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
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <i
          className={`bx text-sm ${
            keepAspectRatio ? 'bx-lock-alt text-violet-400' : 'bx-lock-open-alt'
          }`}
        />
        {keepAspectRatio
          ? `비율 고정 · 원본 ${originalDimensions.width} × ${originalDimensions.height} px`
          : '자유 비율 — 가로·세로 독립 조절'}
      </p>
    </div>
  );
}
