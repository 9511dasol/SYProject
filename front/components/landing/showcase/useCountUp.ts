'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/**
 * run 이 true 가 되는 순간부터 0 → target 으로 숫자를 올린다.
 * prefers-reduced-motion 사용자는 애니메이션 없이 바로 최종값을 본다.
 */
export function useCountUp(target: number, run: boolean, duration = 1200) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    // 모션 최소화 설정이면 타이머를 돌리지 않는다 — 최종값은 아래 return 이 돌려준다
    if (!run || reduced) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, duration, reduced]);

  return reduced ? target : value;
}
