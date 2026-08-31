import { formatDecimal, formatNumber, formatPercent, formatWon } from '@/lib/format';

/** 리포트 표들이 공유하는 표시 포맷 단축 이름 */
export const fmt = {
  num: formatNumber,
  pct: formatPercent,
  won: formatWon,
  dec: (v: number) => formatDecimal(v, 1),
};

/**
 * 표를 옆으로 밀어도 첫 칸(날짜·매체)은 제자리에 붙어 있게 한다 — 좁은 화면에서
 * 오른쪽 지표를 보다가 지금 어느 행인지 놓치지 않도록.
 *
 * bg-inherit 인 이유: 행 배경색이 tr 에 걸려 있어서(tr-even/tr-odd, 수정·삭제 강조 등)
 * 그대로 물려받아야 스크롤된 숫자가 첫 칸 밑으로 비쳐 보이지 않는다.
 */
export const STICKY_CELL = 'sticky left-0 z-10 bg-inherit shadow-[1px_0_0_0_var(--tbl-border)]';

/** 숫자 칸 공통 — 줄바꿈되면 컬럼이 찌그러져서 값을 못 읽는다 */
export const NUM_CELL = 'px-3 py-2 tabular-nums text-right whitespace-nowrap';
