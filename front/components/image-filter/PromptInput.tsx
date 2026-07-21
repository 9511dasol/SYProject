'use client';

import type { ChangeEvent } from 'react';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const EXAMPLES = [
  '배경을 하얀색 배경으로 바꿔줘',
  '흑백 사진으로 변환해줘',
  '사진 속 워터마크나 텍스트를 제거해줘',
  '더 화사하고 밝은 분위기로 보정해줘',
  '배경을 흐릿하게(아웃포커스) 처리해줘',
  '오래된 필름 사진 느낌으로 바꿔줘',
] as const;

export default function PromptInput({ value, onChange, disabled = false }: PromptInputProps) {
  return (
    <div className="space-y-3">
      {/* 텍스트 입력 */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="예) 배경을 스튜디오 흰 배경으로 바꾸고 인물은 그대로 유지해줘"
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

      {/* 예시 프롬프트 칩 */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
          예시 프롬프트
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
