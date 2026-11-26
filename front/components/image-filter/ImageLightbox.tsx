'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImageVersion } from '@/types/imageFilter';

interface ImageLightboxProps {
  version: ImageVersion;
  onClose: () => void;
  onDownload: () => void;
}

/**
 * 결과를 원본 해상도로 확대해 본다.
 *
 * 공용 `Modal` 을 쓰지 않은 이유 — 모달은 폭 상한과 내부 패딩이 있어 이미지가
 * 또 한 번 줄어든다. 여기서 필요한 건 "화면에 들어오는 만큼 꽉" 과 "원본 1:1"
 * 두 가지라, 전용 오버레이가 맞다.
 *
 * 이미지 편집 도구에서 결과물을 320px 썸네일로만 보여 주면 잘 된 편집인지
 * 판단할 수가 없다 — 그걸 메우기 위한 화면이다.
 */
export default function ImageLightbox({ version, onClose, onDownload }: ImageLightboxProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // false = 화면에 맞춰 보기, true = 원본 1:1 (스크롤해서 둘러본다)
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canToggle = !!version.dimensions;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${version.label} 확대 보기`}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-[var(--z-modal)] bg-black/85 backdrop-blur-sm overflow-auto"
    >
      {/* 상단 바 — 오버레이 클릭 판정을 방해하지 않도록 이미지와 형제로 둔다 */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-black/40 backdrop-blur-sm">
        <span className="text-sm font-semibold text-white">{version.label}</span>
        {version.dimensions && (
          <span className="text-xs text-white/60 font-mono">
            {version.dimensions.width}×{version.dimensions.height}
          </span>
        )}

        <div className="flex-1" />

        {canToggle && (
          <button
            type="button"
            onClick={() => setActualSize((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <i className={`bx ${actualSize ? 'bx-collapse-alt' : 'bx-expand-alt'} text-base`} />
            {actualSize ? '화면에 맞추기' : '원본 크기'}
          </button>
        )}
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <i className="bx bx-download text-base" />
          다운로드
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="확대 보기 닫기"
          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <i className="bx bx-x text-xl" />
        </button>
      </div>

      <div className="min-h-[calc(100%-3.5rem)] flex items-center justify-center p-4 pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={version.url}
          alt={`${version.label} 원본 크기`}
          className={
            actualSize
              ? 'max-w-none pointer-events-auto'
              : 'max-w-full max-h-[calc(100dvh-7rem)] object-contain pointer-events-auto'
          }
          style={actualSize && version.dimensions ? { width: version.dimensions.width } : undefined}
        />
      </div>
    </div>
  );
}
