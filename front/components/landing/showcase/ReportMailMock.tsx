'use client';

import { useEffect, useState } from 'react';
import BrowserFrame from './BrowserFrame';
import { useInView } from './useInView';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/** 리포트 메일 + AI 코멘트 목업 — 메일 미리보기 위로 '발송 완료' 토스트가 뜬다 */
export default function ReportMailMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = usePrefersReducedMotion();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const timer = setTimeout(() => setSent(true), reduced ? 0 : 1500);
    return () => clearTimeout(timer);
  }, [inView, reduced]);

  return (
    <div ref={ref} aria-hidden>
      <BrowserFrame title="코멘트 & 리포트 메일">
        <div className="relative p-4 sm:p-5">
          {/* 메일 헤더 */}
          <div className="space-y-1.5 text-[12px]">
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-fg-subtle">받는 사람</span>
              <span className="text-fg-body font-medium">client@example.com</span>
            </div>
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-fg-subtle">제목</span>
              <span className="text-fg font-semibold">2026년 11월 SA 광고 리포트</span>
            </div>
          </div>

          <div className="my-3 border-t border-border-soft" />

          {/* 본문 */}
          <div className="space-y-3 text-[13px] leading-relaxed text-fg-body">
            <p>안녕하세요, 11월 광고 운영 리포트 전달드립니다.</p>

            {/* AI 코멘트 블록 */}
            <div className="rounded-xl border-l-2 border-primary bg-primary-soft/60 px-3.5 py-3">
              <span className="badge badge-info">
                <i className="bx bxs-magic-wand" />
                AI 작성 초안
              </span>
              <p className="mt-2 text-[12.5px] text-fg-muted leading-relaxed">
                11월 전환수는 1,847건으로 전월 대비 18.2% 증가했습니다. 네이버 브랜드검색
                유입 확대가 주효했으며, ROAS는 412%까지 개선됐습니다. 12월에는 성과 상위
                키워드 중심의 예산 재배분을 제안드립니다.
              </p>
            </div>

            {/* 첨부파일 칩 */}
            <div
              className="inline-flex items-center gap-2 rounded-lg border border-border
                bg-surface-2/60 px-3 py-1.5 text-[12px] font-medium text-fg-muted"
            >
              <i className="bx bxs-file-export text-emerald-600 dark:text-emerald-400 text-base" />
              2026-11_SA_리포트.xlsx
            </div>
          </div>

          {/* 발송 완료 토스트 */}
          <div
            className={`absolute bottom-3 right-3 flex items-center gap-2 rounded-xl
              border border-border bg-surface px-3.5 py-2.5 shadow-raised
              transition-all duration-500 ease-out motion-reduce:transition-none
              ${sent ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white">
              <i className="bx bx-check text-sm" />
            </span>
            <div>
              <p className="text-[12px] font-bold text-fg leading-tight">발송 완료</p>
              <p className="text-[10.5px] text-fg-subtle leading-tight">발송 로그에 기록됐습니다</p>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </div>
  );
}
