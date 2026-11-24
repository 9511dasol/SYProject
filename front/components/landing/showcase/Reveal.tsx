'use client';

import type { ReactNode } from 'react';
import { useInView } from './useInView';

interface RevealProps {
  children: ReactNode;
  /** 밀리초 — 같은 행의 텍스트/비주얼을 시차 두고 띄울 때 쓴다 */
  delay?: number;
  className?: string;
}

/** 스크롤로 뷰포트에 들어왔을 때 한 번 떠오르는 래퍼 */
export default function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none
        ${
          inView
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0'
        } ${className}`}
    >
      {children}
    </div>
  );
}
