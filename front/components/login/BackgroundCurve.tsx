import { cx } from '@/lib/cx';

type Mode = 'sign-in' | 'sign-up' | null;

interface BackgroundCurveProps {
  mode: Mode;
}

/** 데스크탑에서 사인인/사인업 패널을 가로지르는 곡선 그라디언트 배경 */
export default function BackgroundCurve({ mode }: BackgroundCurveProps) {
  return (
    <div
      className={cx(
        'absolute top-0 right-0 z-6 hidden h-screen w-[300vw] shadow-[0_5px_15px_rgba(0,0,0,0.35)] transition-all duration-1000 ease-in-out md:block',
        'rounded-tl-[max(50vw,50vh)] rounded-br-[max(50vw,50vh)]',
        'bg-[linear-gradient(-45deg,#4EA685_0%,#57B894_100%)]',
        mode === 'sign-up' ? 'right-1/2 translate-x-full' : 'right-1/2 translate-x-0',
        mode === null && 'right-0 translate-x-[35%]',
      )}
    />
  );
}
