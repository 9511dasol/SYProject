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
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
            'w-full rounded-xl border px-4 py-3 text-sm text-slate-800 resize-none',
            'placeholder:text-slate-300 leading-relaxed',
            'focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400',
            'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
            'transition-colors',
            value ? 'border-indigo-200 bg-indigo-50/10' : 'border-slate-200 bg-white',
          ].join(' ')}
        />
        <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-300 select-none">
          {value.length}/500
        </span>
      </div>

      {/* 예시 조건 칩 */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50/50',
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
