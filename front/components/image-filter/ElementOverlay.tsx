'use client';

import { memo } from 'react';
import type { ImageElement } from '@/types/imageFilter';

interface ElementOverlayProps {
  elements: ImageElement[];
  /** 지시를 이미 써 둔 요소 id — 박스에 표시해 준다 */
  instructedIds: Set<number>;
  /** 지금 편집 모달이 열려 있는 대상 */
  activeId: number | null;
  /** 박스를 누르면 그 요소의 지시 편집 모달을 연다 */
  onPick: (id: number) => void;
  disabled?: boolean;
}

/**
 * 요소 분석 결과를 이미지 위에 겹쳐 그린다.
 *
 * 좌표는 서버가 주는 0~1 비율값이라 CSS 퍼센트로 그대로 매핑한다 — 부모가
 * "렌더된 이미지와 정확히 같은 크기"인 것만 보장하면 박스가 따라붙는다
 * (letterbox 여백까지 포함한 컨테이너에 얹으면 어긋난다. CanvasStage 참고).
 *
 * 예전에는 이 오버레이가 하단 입력창 안의 320px 스크롤 박스에 들어 있어서,
 * 썸네일 위에서 좌표를 클릭해야 했다. 지금은 캔버스 전체 크기로 그려진다.
 *
 * memo: 지시를 타이핑하면 부모가 키 입력마다 렌더된다. 이미지 + 박스 N개를
 * 매번 다시 그릴 이유가 없다 — instructedIds 는 호출부가 내용 키로 참조를 고정한다.
 */
function ElementOverlay({
  elements,
  instructedIds,
  activeId,
  onPick,
  disabled = false,
}: ElementOverlayProps) {
  /* 넓은 박스를 먼저(아래에) 그린다.
     서버는 이미지 전체를 덮는 "배경" 요소를 흔히 돌려주는데, 그게 나중에 그려지면
     위에 깔려 다른 박스를 전부 가린다 — 문구·로고를 눌러도 배경이 클릭을 먹었다. */
  const painted = [...elements].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);

  return (
    <>
      {painted.map((el) => {
        const active = el.id === activeId;
        const instructed = instructedIds.has(el.id);
        return (
          <button
            key={el.id}
            type="button"
            onClick={() => onPick(el.id)}
            disabled={disabled}
            title={
              instructed
                ? `${el.label} — 지시를 써 뒀습니다. 눌러서 수정`
                : `${el.label} — 눌러서 이 부분만 수정`
            }
            className={[
              'absolute rounded-sm border-2 transition-colors group',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              'disabled:pointer-events-none',
              active
                ? 'border-indigo-400 bg-indigo-500/25 z-20'
                : instructed
                  ? 'border-emerald-400 bg-emerald-400/15 hover:bg-emerald-400/25 z-10'
                  : 'border-white/70 hover:border-indigo-300 hover:bg-indigo-300/15',
            ].join(' ')}
            style={{
              left: `${el.box.x * 100}%`,
              top: `${el.box.y * 100}%`,
              width: `${el.box.w * 100}%`,
              height: `${el.box.h * 100}%`,
            }}
          >
            <span
              className={[
                'absolute -top-0.5 left-0 -translate-y-full',
                'inline-flex items-center gap-1 whitespace-nowrap',
                'rounded-t-md px-1.5 py-0.5 text-[10px] font-bold',
                active
                  ? 'bg-indigo-500 text-white'
                  : instructed
                    ? 'bg-emerald-500 text-white'
                    : 'bg-black/65 text-white',
              ].join(' ')}
            >
              {instructed && <i className="bx bxs-edit text-[10px]" />}
              {el.label}
            </span>
          </button>
        );
      })}
    </>
  );
}

export default memo(ElementOverlay);
