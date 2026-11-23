import { cx } from '@/lib/cx';

type Mode = 'sign-in' | 'sign-up' | null;

interface BackgroundCurveProps {
  mode: Mode;
}

/** 데스크탑에서 사인인/사인업 패널을 가로지르는 곡선 그라디언트 배경.
 *
 *  pointer-events-none 이 핵심이다. 이 패널은 z-6 으로 폼 위에 그려지는데,
 *  순수 장식인데도 클릭을 받아 — 진입 직후(mode=null 로 화면 대부분을 덮는 200ms
 *  + 슬라이드 1초)와 패널 경계 좌표에서는 입력창·로그인 버튼 클릭이 조용히
 *  삼켜졌다. 브라우저 자동화가 모바일 폭으로 우회해야 로그인되던 원인도 이것이다.
 */
export default function BackgroundCurve({ mode }: BackgroundCurveProps) {
  return (
    <div
      aria-hidden
      className={cx(
        'pointer-events-none absolute top-0 right-0 z-6 hidden h-screen w-[300vw] shadow-[0_5px_15px_rgba(0,0,0,0.35)] transition-all duration-1000 ease-in-out md:block',
        'rounded-tl-[max(50vw,50vh)] rounded-br-[max(50vw,50vh)]',
        'bg-[linear-gradient(-45deg,#4EA685_0%,#57B894_100%)]',
        mode === 'sign-up' ? 'right-1/2 translate-x-full' : 'right-1/2 translate-x-0',
        mode === null && 'right-0 translate-x-[35%]',
      )}
    />
  );
}
