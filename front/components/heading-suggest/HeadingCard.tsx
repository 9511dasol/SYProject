'use client';

import { useState } from 'react';
import type { HeadingItem } from '@/types/heading';

interface HeadingCardProps {
  item: HeadingItem;
}

const PLATFORM_STYLES = {
  Instagram: {
    badge:  'bg-gradient-to-r from-pink-500 to-purple-500 text-white',
    border: 'border-l-pink-400',
    icon:   'bx-camera',
  },
  Blog: {
    badge:  'bg-emerald-100 text-emerald-700',
    border: 'border-l-emerald-400',
    icon:   'bx-edit-alt',
  },
  YouTube: {
    badge:  'bg-red-100 text-red-600',
    border: 'border-l-red-400',
    icon:   'bx-play-circle',
  },
} as const;

export default function HeadingCard({ item }: HeadingCardProps) {
  const [copied, setCopied] = useState(false);
  const style = PLATFORM_STYLES[item.platform];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 접근 불가 환경 무시 */
    }
  }

  return (
    <div
      className={[
        'group relative bg-white rounded-2xl border border-slate-200/70 border-l-4',
        style.border,
        'p-5 shadow-sm shadow-slate-100 hover:shadow-md hover:shadow-slate-200',
        'transition-all duration-200 hover:-translate-y-0.5',
      ].join(' ')}
    >
      {/* 플랫폼 배지 */}
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mb-3 ${style.badge}`}
      >
        <i className={`bx ${style.icon} text-xs`} />
        {item.platform}
      </span>

      {/* 헤딩 텍스트 */}
      <p className="text-base font-bold text-slate-800 leading-snug break-words pr-8">
        {item.text}
      </p>

      {/* 추천 이유 */}
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
        {item.desc}
      </p>

      {/* 호버 복사 버튼 */}
      <button
        onClick={handleCopy}
        title="클립보드에 복사"
        className={[
          'absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-all duration-150',
          copied
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600',
        ].join(' ')}
      >
        <i className={`bx ${copied ? 'bx-check' : 'bx-copy'} text-sm`} />
      </button>

      {/* 복사 완료 토스트 */}
      {copied && (
        <span className="absolute top-4 right-14 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 whitespace-nowrap">
          복사됨!
        </span>
      )}
    </div>
  );
}
