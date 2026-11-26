'use client';

import { useEffect, useRef } from 'react';
import type { ImageVersion } from '@/types/imageFilter';

interface VersionRailProps {
  versions: ImageVersion[];
  activeId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

const KIND_ICON: Record<ImageVersion['kind'], string> = {
  original: 'bx-image',
  edited: 'bxs-magic-wand',
  background: 'bx-landscape',
};

/**
 * 원본 → 편집 결과 → 배경 시안으로 이어지는 계보를 썸네일 한 줄로 보여 준다.
 *
 * 예전에는 결과가 채팅 버블로 쌓였고, 지난 결과를 다시 보려면 대화를 거슬러
 * 올라가야 했다. 무엇보다 "이 결과로 계속 편집"을 누른 뒤에는 지금 보고 있는
 * 이미지가 어디서 갈라져 나온 것인지 알 방법이 없었다 — 레일은 그걸 드러낸다.
 */
export default function VersionRail({
  versions,
  activeId,
  onSelect,
  disabled = false,
}: VersionRailProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // 새 결과가 붙으면 레일이 넘쳐 화면 밖에 생긴다 — 활성 항목을 끌어다 보여 준다
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const labelOf = (id: string | null) => versions.find((v) => v.id === id)?.label ?? null;

  return (
    <div
      className="shrink-0 border-t border-border-soft bg-surface/60 px-3 py-2.5 overflow-x-auto"
      role="tablist"
      aria-label="이미지 버전"
    >
      <div className="flex items-stretch gap-2 w-max">
        {versions.map((version) => {
          const selected = version.id === activeId;
          const parentLabel = labelOf(version.parentId);
          return (
            <button
              key={version.id}
              ref={selected ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(version.id)}
              disabled={disabled}
              title={
                [
                  version.label,
                  parentLabel && `${parentLabel} 에서 생성`,
                  version.note,
                ]
                  .filter(Boolean)
                  .join('\n') || version.label
              }
              className={[
                'group relative flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all shrink-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'disabled:opacity-50 disabled:pointer-events-none',
                selected
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 ring-2 ring-indigo-400'
                  : 'hover:bg-surface-2 ring-1 ring-border',
              ].join(' ')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={version.url}
                alt=""
                className="w-14 h-14 rounded-lg object-cover bg-surface-3"
              />
              <span
                className={[
                  'inline-flex items-center gap-0.5 text-[10px] font-semibold max-w-16 truncate',
                  selected ? 'text-indigo-600 dark:text-indigo-400' : 'text-fg-muted',
                ].join(' ')}
              >
                <i className={`bx ${KIND_ICON[version.kind]} text-[11px] shrink-0`} />
                <span className="truncate">{version.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
