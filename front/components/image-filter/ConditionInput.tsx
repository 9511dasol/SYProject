'use client';

import type { ChangeEvent, KeyboardEvent } from 'react';

interface ConditionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const EXAMPLES = [
  '텍스트나 글자가 없는 깨끗한 사진',
  '사람 얼굴이 포함된 인물 사진',
  '야외 자연 풍경 사진',
  '배경이 단색이거나 밝은 사진',
  '음식이 담긴 사진',
  '로고나 워터마크가 없는 사진',
] as const;

export default function ConditionInput({ value, onChange, disabled = false }: ConditionInputProps) {
  const handleKeyDown = (_e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter 줄바꿈, Enter 단독은 기본 동작 허용
  };

  return (
    <div className="space-y-3">
      {/* 텍스트 입력 */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="예) 배경이 깨끗하고 텍스트가 없는 상품 이미지만 선별해줘"
          rows={3}
          maxLength={500}
          className={[
            'w-full rounded-xl border px-4 py-3 text-sm resize-none leading-relaxed',
            'text-slate-800 dark:text-slate-100',
            'placeholder:text-slate-300 dark:placeholder:text-slate-600',
            'focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-400 dark:focus:border-indigo-600',
            'disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed',
            'transition-colors',
            value
              ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50/10 dark:bg-indigo-950/20'
              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800',
          ].join(' ')}
        />
        <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-300 dark:text-slate-600 select-none">
          {value.length}/500
        </span>
      </div>

      {/* 예시 조건 칩 */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
          예시 조건
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onChange(example)}
              disabled={disabled}
              className={[
                'text-xs px-2.5 py-1 rounded-lg border transition-all duration-150',
                value === example
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
