'use client';

import type { ImageElement } from '@/types/imageFilter';

/**
 * 요소 분석 결과를 이미지 위에 겹쳐 그리고 클릭으로 수정 대상을 고르게 한다.
 *
 * 좌표는 서버가 주는 0~1 비율값이라 CSS 퍼센트로 그대로 매핑한다 — 이미지가
 * 어떤 크기로 렌더되든 박스가 따라붙는다. 같은 요소를 다시 클릭하면 해제되어
 * 기존의 "이미지 전체 편집" 모드로 돌아간다.
 */
export default function ElementPicker({
  previewUrl,
  elements,
  selectedId,
  onSelect,
  disabled,
}: {
  previewUrl: string;
  elements: ImageElement[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  disabled?: boolean;
}) {
  const toggle = (id: number) => {
    if (disabled) return;
    onSelect(id === selectedId ? null : id);
  };

  return (
    <div className="space-y-3">
      {/* 박스 오버레이 */}
      <div className="relative inline-block max-w-full rounded-xl overflow-hidden border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="요소 분석 미리보기" className="block max-w-full h-auto" />
        {elements.map((el) => {
          const selected = el.id === selectedId;
          return (
            <button
              key={el.id}
              type="button"
              onClick={() => toggle(el.id)}
              disabled={disabled}
              title={el.label}
              className={`absolute border-2 rounded-sm transition-colors ${
                selected
                  ? 'border-indigo-500 bg-indigo-500/20 z-10'
                  : 'border-white/70 bg-black/0 hover:border-indigo-300 hover:bg-indigo-300/10'
              }`}
              style={{
                left: `${el.box.x * 100}%`,
                top: `${el.box.y * 100}%`,
                width: `${el.box.w * 100}%`,
                height: `${el.box.h * 100}%`,
              }}
            >
              <span
                className={`absolute -top-0.5 left-0 -translate-y-full px-1.5 py-0.5 text-[10px] font-bold rounded-t-md whitespace-nowrap ${
                  selected ? 'bg-indigo-500 text-white' : 'bg-black/60 text-white'
                }`}
              >
                {el.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 요소 칩 목록 — 박스가 겹쳐 클릭이 어려울 때의 대체 선택 수단 */}
      <div className="flex flex-wrap gap-1.5">
        {elements.map((el) => {
          const selected = el.id === selectedId;
          return (
            <button
              key={el.id}
              type="button"
              onClick={() => toggle(el.id)}
              disabled={disabled}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selected
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-surface-2 text-fg-muted border-border hover:border-indigo-300'
              }`}
            >
              {el.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-fg-subtle">
        {selectedId !== null
          ? '선택한 요소만 수정됩니다. 같은 요소를 다시 누르면 선택이 해제됩니다.'
          : '요소를 클릭하면 그 부분만 수정합니다. 선택하지 않으면 이미지 전체에 프롬프트가 적용됩니다.'}
      </p>
    </div>
  );
}
