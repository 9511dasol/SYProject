import type { ReactNode } from 'react';
import Reveal from './showcase/Reveal';

interface ShowcaseSectionProps {
  /** 좌우 반전 — true 면 데스크톱에서 비주얼이 왼쪽에 온다 */
  flip?: boolean;
  eyebrow: string;
  icon: string;
  isNew?: boolean;
  title: ReactNode;
  body: string;
  bullets: readonly string[];
  /** 비주얼(목업) 영역 */
  children: ReactNode;
}

/** 랜딩 지그재그 쇼케이스 한 줄 — 텍스트 컬럼 + 목업 컬럼 */
export default function ShowcaseSection({
  flip = false,
  eyebrow,
  icon,
  isNew = false,
  title,
  body,
  bullets,
  children,
}: ShowcaseSectionProps) {
  return (
    <div className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
      {/* min-w-0: 그리드 아이템 기본값(min-width:auto)이면 목업의 min-content가
          좁은 화면에서 트랙을 밀어내 페이지가 가로로 넘친다 */}
      <Reveal className={`min-w-0 ${flip ? 'lg:order-2' : ''}`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <i className={`bx ${icon} text-base`} />
          {eyebrow}
          {isNew && <span className="badge badge-info">NEW</span>}
        </p>
        <h3 className="mt-3 text-xl sm:text-2xl font-bold text-fg tracking-tight leading-snug">
          {title}
        </h3>
        <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2.5 text-sm text-fg-body">
              <i className="bx bx-check-circle text-primary text-lg shrink-0 leading-5" />
              <span className="leading-relaxed">{bullet}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={120} className={`min-w-0 ${flip ? 'lg:order-1' : ''}`}>
        {children}
      </Reveal>
    </div>
  );
}
