'use client';

import { useRef, useState } from 'react';
import { formatFileSize } from '@/lib/format';

/** 업로드 패널의 작은 조각들 — 단계 표시 · 드롭존 · 파일 한 줄 */

// ── 단계 표시 ─────────────────────────────────────────────────────────────────

export function Steps({ step }: { step: 1 | 2 }) {
  const items = ['파일', '확인'] as const;
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((label, i) => {
        const index = (i + 1) as 1 | 2;
        const done = step > index;
        const active = step === index;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <span className="w-6 h-px bg-border" />}
            <span
              className={`inline-flex items-center gap-1.5 font-medium
                ${active ? 'text-primary' : done ? 'text-fg-muted' : 'text-fg-subtle'}`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${active ? 'bg-primary text-white' : done ? 'bg-fg-subtle/30 text-fg-muted' : 'bg-surface-3 text-fg-subtle'}`}
              >
                {done ? <i className="bx bx-check" /> : index}
              </span>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 드롭존 ────────────────────────────────────────────────────────────────────

/**
 * 업로드 드롭존.
 *
 * `components/image-resize/DropZone` 과 이름이 같아 혼동을 부르던 것이라 이름을 바꿨다.
 * 그쪽은 이미지 한 장을 받고 미리보기를 그리는 컴포넌트이고, 이건 CSV·XLSX 를 받는다.
 *
 * 진짜 `<button>` 이라 키보드로도 열린다 — 예전에는 onClick 만 있는 div 여서 키보드로는
 * 파일을 올릴 방법이 없었다.
 */
export function UploadDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          // preventDefault 를 빠뜨리면 브라우저가 그 파일로 페이지를 이동시켜
          // 작업하던 화면이 통째로 날아간다.
          e.preventDefault();
          setOver(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
        className={`w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors
          flex flex-col items-center justify-center py-12 gap-2 text-center
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
          ${over
            ? 'border-primary bg-primary-soft/40 dark:bg-primary-soft/10'
            : 'border-border hover:border-primary/60 hover:bg-surface-2'}`}
      >
        <i className={`bx bx-cloud-upload text-4xl ${over ? 'text-primary' : 'text-fg-subtle'}`} />
        <p className="text-sm font-medium text-fg">
          여기에 끌어다 놓거나 <span className="text-primary">클릭해서 선택</span>
        </p>
        <p className="text-xs text-fg-subtle">
          매체·전환 <strong className="font-semibold">.csv</strong> 여러 개 &nbsp;·&nbsp;
          리포트 <strong className="font-semibold">.xlsx</strong> 한 개
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        multiple
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <p className="mt-3 text-xs text-fg-subtle leading-relaxed">
        어떤 방식인지는 확장자로 알아서 판단합니다. CSV 는 분석해서 DB에 저장하고,
        엑셀은 담긴 기간을 읽어 원하는 달만 골라 저장합니다.
      </p>
    </>
  );
}

// ── 파일 목록의 한 줄 ─────────────────────────────────────────────────────────

export function FileRow({ file, onRemove }: { file: File; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <i className="bx bx-file-blank text-lg text-primary shrink-0" />
      <span className="flex-1 truncate text-sm text-fg">{file.name}</span>
      <span className="text-xs text-fg-subtle tabular-nums shrink-0">{formatFileSize(file.size)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${file.name} 제거`}
          className="shrink-0 text-fg-subtle hover:text-badge-danger-fg transition-colors"
        >
          <i className="bx bx-x text-lg" />
        </button>
      )}
    </li>
  );
}
