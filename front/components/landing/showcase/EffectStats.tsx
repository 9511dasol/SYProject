'use client';

import { useCountUp } from './useCountUp';
import { useInView } from './useInView';

/**
 * 도입 효과 스탯 — 수치는 실측이 아니라 사내 운영 시나리오 기준 예시값.
 * 캡션에 그 사실을 항상 함께 적는다(랜딩 숫자가 실측치로 오해되면 안 된다).
 */
const STATS = [
  {
    target: 87,
    format: (n: number) => `${n}%`,
    label: '리포트 반복 작업 시간 절감',
    caption: '월 리포트 1건 4시간 → 30분 기준',
  },
  {
    target: 5,
    format: (n: number) => `${n}개 → 1개`,
    label: '오가던 도구를 한 화면으로',
    caption: '집계 · 분석 · 메일 · 이미지 · 문구',
  },
  {
    target: 365,
    format: (n: number) => `${n}일`,
    label: '키워드 순위 자동 기록',
    caption: '매일 아침 수동 검색 대체',
  },
] as const;

export default function EffectStats() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  // 훅 규칙상 반복문 밖에서 각각 호출한다
  const first = useCountUp(STATS[0].target, inView);
  const second = useCountUp(STATS[1].target, inView);
  const third = useCountUp(STATS[2].target, inView);
  const values = [first, second, third];

  return (
    <div ref={ref}>
      <div className="grid sm:grid-cols-3 gap-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-surface/90 p-6 text-center shadow-sm"
          >
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums
              bg-linear-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent"
            >
              {stat.format(values[i])}
            </p>
            <p className="mt-2 text-sm font-bold text-fg">{stat.label}</p>
            <p className="mt-1 text-xs text-fg-subtle">{stat.caption}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-fg-subtle">
        수치는 사내 운영 시나리오 기준 예시이며, 팀 규모와 매체 수에 따라 달라질 수 있습니다
      </p>
    </div>
  );
}
