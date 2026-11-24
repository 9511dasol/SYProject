'use client';

import { useState } from 'react';
import type { HeadingItem } from '@/types/heading';

interface HeadingCardProps {
  item: HeadingItem;
}

const PLATFORM_STYLES = {
  Instagram: {
    badge:  'bg-linear-to-r from-pink-500 to-purple-500 text-white',
    border: 'border-l-pink-400',
    icon:   'bx-camera',
  },
  Blog: {
    badge:  'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
    border: 'border-l-emerald-400',
    icon:   'bx-edit-alt',
  },
  YouTube: {
    badge:  'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
    border: 'border-l-red-400',
    icon:   'bx-play-circle',
  },
} as const;

/**
 * 플랫폼별 권장 최대 글자수 — 노출 영역에서 잘리지 않는 경험칙 기준.
 * Instagram 은 피드 캡션 첫 줄(더보기 접힘 전), Blog 는 네이버 검색 결과
 * 제목 노출, YouTube 는 모바일 제목 노출 기준이다. 넘어도 쓸 수는 있으므로
 * 차단이 아니라 표시만 한다.
 */
const RECOMMENDED_MAX: Record<HeadingItem['platform'], number> = {
  Instagram: 30,
  Blog:      30,
  YouTube:   40,
};

export default function HeadingCard({ item }: HeadingCardProps) {
  const [copied, setCopied] = useState(false);
  const style = PLATFORM_STYLES[item.platform];
  const recommendedMax = RECOMMENDED_MAX[item.platform];
  const charCount = [...item.text].length;
  const overLimit = charCount > recommendedMax;

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
        'bg-surface-2 rounded-2xl border border-border border-l-4',
        style.border,
        'p-5 shadow-card hover:shadow-raised',
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
      <p className="text-base font-bold text-fg leading-snug wrap-break-word">
        {item.text}
      </p>

      {/* 추천 이유 */}
      <p className="text-xs text-fg-muted mt-2 leading-relaxed">
        {item.desc}
      </p>

      {/* 글자수 + 복사 — 핵심 액션이라 호버 없이 항상 보여야 한다(터치 기기 포함) */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/60">
        <span
          className={[
            'text-[11px] tabular-nums',
            overLimit ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-fg-subtle',
          ].join(' ')}
        >
          {charCount}자 · 권장 {recommendedMax}자 이내
          <i
            className={`bx ${overLimit ? 'bx-error' : 'bx-check'} text-sm align-middle ml-0.5`}
            title={overLimit ? '노출 영역에서 잘릴 수 있어요' : '권장 길이 이내'}
          />
        </span>
        <button
          onClick={handleCopy}
          className={[
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors shrink-0',
            copied
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
              : 'bg-surface-3 border-border text-fg-muted hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-200 dark:hover:border-amber-800 hover:text-amber-600 dark:hover:text-amber-400',
          ].join(' ')}
        >
          <i className={`bx ${copied ? 'bx-check' : 'bx-copy'} text-sm`} />
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
    </div>
  );
}
