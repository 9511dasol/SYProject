'use client';

import { useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import Button from '@/components/ui/Button';
import type { FilterFormState, ImageVersion } from '@/types/imageFilter';

interface FilterToolbarProps {
  /** 맨 앞자리 — 좁은 화면에서 대화 목록을 여는 버튼이 들어온다 */
  leading?: ReactNode;
  /** 원본 버전 — 파일명·크기를 여기서 읽는다 */
  original: ImageVersion;
  form: FilterFormState;
  /** 출력 요약 칩을 누르면 대화 열의 출력 설정이 열린다 */
  onOpenSettings: () => void;
  onReplace: (file: File) => void;
  onReset: () => void;
  /** AI 작업 중 — 이미지 교체·초기화를 막는다 */
  locked: boolean;
}

/**
 * 화면 맨 위 한 줄 — 무엇을 다루고 있고 무엇으로 뽑히는지.
 *
 * 예전에는 이 자리에 페이지 전용 헤더가 있었다. "이미지 정제 / 채팅하듯 지시하면
 * Gemini가 편집해 드려요" 두 줄인데, 공통 헤더가 이미 "크리에이티브 › 이미지 정제"
 * 를 보여 주고 있어 같은 정보가 두 번 쌓이면서 약 68px 을 더 먹었다. 그 자리를
 * 실제로 필요한 정보(첨부 파일·출력 설정)로 바꿨다.
 */
export default function FilterToolbar({
  leading,
  original,
  form,
  onOpenSettings,
  onReplace,
  onReset,
  locked,
}: FilterToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) onReplace(picked);
    e.target.value = '';
  };

  const width = parseInt(form.targetWidth, 10) || 0;
  const height = parseInt(form.targetHeight, 10) || 0;
  const sizeLabel = width > 0 && height > 0 ? `${width}×${height}` : '원본 크기';
  const sizeMB = (original.file.size / 1024 / 1024).toFixed(2);

  return (
    <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-border bg-surface shrink-0">
      {leading}
      {/* 첨부 파일 */}
      <div className="flex items-center gap-2 min-w-0 rounded-xl bg-surface-2 border border-border pl-1.5 pr-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={original.url}
          alt=""
          className="w-7 h-7 rounded-lg object-cover border border-border bg-surface-3 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-fg truncate max-w-32 sm:max-w-56">
            {original.file.name}
          </p>
          <p className="text-[10px] text-fg-subtle">
            {sizeMB} MB
            {original.dimensions &&
              ` · ${original.dimensions.width}×${original.dimensions.height}px`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={locked}
        title="다른 이미지로 교체 (드래그·붙여넣기도 됩니다)"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
      >
        <i className="bx bx-image-add text-base" />
        <span className="hidden sm:inline">교체</span>
      </button>

      <div className="flex-1" />

      {/* 출력 요약 — 누르면 대화 열의 출력 설정이 열린다 */}
      <button
        type="button"
        onClick={onOpenSettings}
        title="출력 크기·포맷 설정 열기"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg-muted hover:border-indigo-200 dark:hover:border-indigo-700 hover:text-fg transition-colors shrink-0"
      >
        <i className="bx bx-slider-alt text-base" />
        <span className="font-mono">{sizeLabel}</span>
        <span className="hidden sm:inline">· {form.outputFormat.toUpperCase()}</span>
      </button>

      <Button variant="outline" size="sm" onClick={onReset} disabled={locked} className="shrink-0">
        <i className="bx bx-plus text-base" />
        <span className="hidden sm:inline">새 작업</span>
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handlePick}
        disabled={locked}
      />
    </div>
  );
}
