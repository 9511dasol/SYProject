'use client';

import { useEffect, useState } from 'react';
import { useInView } from './useInView';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const PROMPT = '배경을 흰색으로 바꾸고 제품은 그대로 둬 줘';

/** 정제 전/후에 같은 소재를 그린다 — 배경만 달라져 '배경 교체'가 한눈에 읽힌다 */
function ProductScene({ clean }: { clean: boolean }) {
  return (
    <div
      className={`relative aspect-[4/3] rounded-xl overflow-hidden border border-border
        ${clean ? 'bg-white' : ''}`}
    >
      {/* 정제 전: 어수선한 배경 */}
      {!clean && (
        <div className="absolute inset-0 bg-linear-to-br from-orange-300 via-rose-300 to-purple-400">
          <span className="absolute -top-3 -left-3 w-16 h-16 rounded-full bg-yellow-300/70" />
          <span className="absolute bottom-2 right-3 w-10 h-10 rounded-full bg-fuchsia-500/50" />
          <span className="absolute top-4 right-8 w-6 h-6 rotate-12 bg-white/40" />
          <span className="absolute bottom-6 left-5 w-12 h-3 -rotate-6 bg-emerald-400/60" />
        </div>
      )}

      {/* 공통 소재: 화장품 병 */}
      <div className="absolute inset-0 flex items-end justify-center pb-3">
        <div className="flex flex-col items-center drop-shadow-md">
          <div className="w-5 h-3.5 rounded-t-sm bg-slate-700" />
          <div className="w-14 h-20 rounded-lg bg-linear-to-b from-sky-300 to-sky-500 flex items-center justify-center">
            <div className="w-10 h-9 rounded-sm bg-white/90 px-1.5 py-1 space-y-1">
              <div className="h-1 rounded-full bg-slate-400" />
              <div className="h-1 rounded-full bg-slate-300 w-3/4" />
              <div className="h-1 rounded-full bg-slate-300 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 이미지 정제 목업 — 프롬프트 타이핑 → Before/After 전환 */
export default function ImageFilterMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = usePrefersReducedMotion();
  const [typedCount, setTypedCount] = useState(0);

  useEffect(() => {
    // 모션 최소화 설정이면 타이핑을 돌리지 않는다 — 완성된 문장은 visibleCount 가 돌려준다
    if (!inView || reduced) return;

    const id = setInterval(() => {
      setTypedCount((n) => {
        if (n >= PROMPT.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 55);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const visibleCount = reduced ? PROMPT.length : typedCount;
  const done = visibleCount >= PROMPT.length;

  return (
    <div ref={ref} aria-hidden>
      <div className="rounded-2xl border border-border bg-surface shadow-raised p-4 sm:p-5 space-y-4">
        {/* 프롬프트 입력창 */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5">
          <i className="bx bxs-magic-wand text-primary text-lg shrink-0" />
          <p className="flex-1 min-w-0 text-[13px] text-fg-body truncate">
            {PROMPT.slice(0, visibleCount)}
            {!done && <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-primary animate-pulse align-middle" />}
          </p>
          <span
            className={`badge shrink-0 transition-opacity duration-300
              ${done ? 'badge-info opacity-100' : 'badge-neutral opacity-60'}`}
          >
            {done ? 'AI 편집 적용' : '입력 중…'}
          </span>
        </div>

        {/* Before → After */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 sm:gap-3">
          <div>
            <ProductScene clean={false} />
            <p className="mt-2 text-center text-[11px] font-semibold text-fg-subtle">Before</p>
          </div>

          <i className="bx bx-right-arrow-alt text-2xl text-fg-subtle" />

          <div
            className={`transition-all duration-700 ease-out motion-reduce:transition-none
              ${done ? 'opacity-100 blur-0' : 'opacity-40 blur-[2px] motion-reduce:opacity-100 motion-reduce:blur-0'}`}
          >
            <div className="relative">
              <ProductScene clean />
              <span
                className={`badge badge-success absolute top-2 right-2 transition-opacity duration-500
                  ${done ? 'opacity-100' : 'opacity-0 motion-reduce:opacity-100'}`}
              >
                <i className="bx bx-check" />
                편집 완료
              </span>
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold text-fg-subtle">After</p>
          </div>
        </div>

        <p className="text-[11px] text-fg-subtle text-center">
          예시 화면 — 실제로는 업로드한 소재 이미지를 프롬프트대로 편집합니다
        </p>
      </div>
    </div>
  );
}
