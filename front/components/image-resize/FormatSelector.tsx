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
                ? 'border-violet-400 bg-violet-50 shadow-sm shadow-violet-100'
                : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            <i
              className={`bx ${fmt.icon} text-2xl block mb-1.5 ${
                isSelected ? 'text-violet-500' : 'text-slate-400'
              }`}
            />
            <p
              className={`text-sm font-semibold ${
                isSelected ? 'text-violet-700' : 'text-slate-700'
              }`}
            >
              {fmt.label}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{fmt.description}</p>
          </button>
        );
      })}
    </div>
  );
}
