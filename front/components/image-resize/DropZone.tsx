'use client';

import { useRef, useState, useCallback } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import type { DropZoneProps } from '@/types/imageResize';

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);
const MAX_BYTES = 50 * 1024 * 1024;

export default function DropZone({
  file,
  previewUrl,
  originalDimensions,
  onFileSelect,
  onClear,
  disabled = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = useCallback((f: File): string | null => {
    if (!ACCEPTED_MIME.has(f.type)) return 'JPEG · PNG · WebP · GIF · BMP 파일만 지원됩니다.';
    if (f.size > MAX_BYTES) return '파일 크기는 50MB 이하여야 합니다.';
    return null;
  }, []);

  const handleSelect = useCallback(
    (f: File) => {
      const err = validate(f);
      if (err) { setValidationError(err); return; }
      setValidationError(null);
      onFileSelect(f);
    },
    [validate, onFileSelect]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const f = e.dataTransfer.files[0];
      if (f) handleSelect(f);
    },
    [disabled, handleSelect]
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleSelect(f);
    e.target.value = '';
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : null;

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="이미지 업로드 영역"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        className={[
          'relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden select-none',
          isDragging && !disabled
            ? 'border-violet-400 bg-violet-50/60 dark:bg-violet-950/60 dark:border-violet-500 scale-[1.005]'
            : file
            ? 'border-violet-300 dark:border-violet-700 bg-violet-50/20 dark:bg-violet-950/20 hover:border-violet-400 dark:hover:border-violet-600'
            : 'border-border hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50/20 dark:hover:bg-violet-950/20',
          disabled && 'opacity-60 cursor-not-allowed',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {file && previewUrl ? (
          /* ── 파일 선택 후 미리보기 ── */
          <div className="flex items-center gap-4 p-5">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-surface-3 shrink-0 border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file.name}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-fg truncate text-sm">{file.name}</p>
              <p className="text-xs text-fg-muted mt-1">
                {fileSizeMB} MB
                {originalDimensions && (
                  <span className="ml-2 text-violet-500 dark:text-violet-400 font-medium">
                    {originalDimensions.width} × {originalDimensions.height} px
                  </span>
                )}
              </p>
              <p className="text-xs text-violet-400 mt-2">클릭해서 다른 파일로 교체</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-fg-subtle hover:text-red-400 transition-colors shrink-0"
              title="삭제"
            >
              <i className="bx bx-x text-xl" />
            </button>
          </div>
        ) : (
          /* ── 파일 선택 전 안내 ── */
          <div className="flex flex-col items-center justify-center gap-4 py-14 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center ring-1 ring-violet-100 dark:ring-violet-900">
              <i
                className={`bx text-4xl text-violet-400 ${
                  isDragging ? 'bx-download animate-bounce' : 'bx-cloud-upload'
                }`}
              />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-fg-body">
                {isDragging ? '여기에 놓으세요!' : '이미지를 드래그하거나 클릭하여 업로드'}
              </p>
              <p className="text-xs text-fg-subtle">JPEG · PNG · WebP · GIF · BMP · 최대 50 MB</p>
            </div>
          </div>
        )}
      </div>

      {validationError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-2.5">
          <i className="bx bx-error-circle text-red-400 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
