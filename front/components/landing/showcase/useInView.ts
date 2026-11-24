'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 요소가 뷰포트에 처음 들어온 순간을 감지한다.
 * 한 번 보이면 true 로 고정 — 스크롤로 되돌아와도 애니메이션을 다시 돌리지 않는다.
 */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}
