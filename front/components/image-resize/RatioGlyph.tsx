/** 비율을 모양으로 보여주는 작은 사각형 — 숫자를 읽지 않고 모양으로 고르게 한다 */
export default function RatioGlyph({ w, h, filled }: { w: number; h: number; filled: boolean }) {
  // 긴 변을 12px 로 고정하고 짧은 변을 비율대로 줄인다
  const longest = Math.max(w, h);
  const gw = Math.max(4, Math.round((w / longest) * 12));
  const gh = Math.max(4, Math.round((h / longest) * 12));
  return (
    <span
      aria-hidden
      className={[
        'inline-block rounded-[2px] border shrink-0',
        filled ? 'border-white/80 bg-white/20' : 'border-current opacity-60',
      ].join(' ')}
      style={{ width: gw, height: gh }}
    />
  );
}
