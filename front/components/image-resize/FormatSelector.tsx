'use client';

import type { FormatOption, FormatSelectorProps } from '@/types/imageResize';

const FORMATS: FormatOption[] = [
  {
    value: 'jpeg',
    label: 'JPEG',
    description: '손실 압축 · 사진에 최적',
    icon: 'bx-image',
  },
  {
    value: 'png',
    label: 'PNG',
    description: '무손실 · 투명 배경 지원',
    icon: 'bx-image-alt',
  },
  {
    value: 'webp',
    label: 'WebP',
    description: '고효율 · 최신 브라우저',
    icon: 'bx-images',
  },
];

export default function FormatSelector({
  value,
  onChange,
  disabled = false,
}: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {FORMATS.map((fmt) => {
        const isSelected = value === fmt.value;
        return (
          <button
            key={fmt.value}
            type="button"
            onClick={() => onChange(fmt.value)}
            disabled={disabled}
            className={[
              'rounded-xl border-2 px-3 py-3 text-left transition-all duration-150',
              isSelected
                ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-950/50 shadow-sm shadow-violet-100 dark:shadow-violet-900/30'
                : 'border-border bg-surface-2 hover:border-violet-200 dark:hover:border-violet-700 hover:bg-violet-50/30 dark:hover:bg-violet-950/20',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            <i
              className={`bx ${fmt.icon} text-2xl block mb-1.5 ${
                isSelected ? 'text-violet-500 dark:text-violet-400' : 'text-fg-subtle'
              }`}
            />
            <p
              className={`text-sm font-semibold ${
                isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-fg-body'
              }`}
            >
              {fmt.label}
            </p>
            <p className="text-xs text-fg-subtle mt-0.5 leading-snug">{fmt.description}</p>
          </button>
        );
      })}
    </div>
  );
}
