'use client';

import { useCallback, useState } from 'react';
import ElementOverlay from '@/components/image-filter/ElementOverlay';
import VersionRail from '@/components/image-filter/VersionRail';
import type { ImageElement, ImageVersion } from '@/types/imageFilter';

interface CanvasStageProps {
  versions: ImageVersion[];
  active: ImageVersion;
  onSelectVersion: (id: string) => void;
  elements: ImageElement[] | null;
  instructedIds: Set<number>;
  editingElementId: number | null;
  onPickElement: (id: number) => void;
  /** 요소 박스 클릭을 막아야 하는 상태 (AI 작업 중) */
  locked: boolean;
  /** 진행 중 안내 문구 — 있으면 캔버스 위에 띠로 띄운다 */
  statusText: string | null;
  onZoom: () => void;
  onDownload: () => void;
}

/** 렌더된 이미지의 실제 사각형 (letterbox 여백을 뺀 영역) */
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 작업 중인 이미지를 캔버스 가용 높이 전체로 보여 주고, 요소 박스를 그 위에 얹는다.
 *
 * 핵심은 오버레이를 **컨테이너가 아니라 렌더된 이미지 사각형**에 맞추는 것이다.
 * `object-contain` 은 비율을 지키느라 위아래(또는 좌우)에 여백을 남기는데, 컨테이너
 * 기준으로 퍼센트 좌표를 찍으면 박스가 그 여백만큼 밀린다. 그래서 컨테이너 크기와
 * 원본 치수로 letterbox 사각형을 직접 계산해, 이미지와 오버레이를 같은 박스에 담는다.
 */
export default function CanvasStage({
  versions,
  active,
  onSelectVersion,
  elements,
  instructedIds,
  editingElementId,
  onPickElement,
  locked,
  statusText,
  onZoom,
  onDownload,
}: CanvasStageProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  /**
   * 스테이지 크기를 잰다. 요소 박스 좌표가 전적으로 이 값에 달려 있다.
   *
   * ResizeObserver 에만 맡기면 안 된다 — 탭이 가려져 있거나 렌더러가 통지를
   * 조절하는 환경에서는 **첫 통지조차 오지 않는 경우가 있고**, 그러면 박스가
   * 영원히 안 그려진다(패널에는 "5개 찾음"이라 떠 있는데 이미지 위에는 아무것도
   * 없는 상태). 그래서 첫 측정은 ref 콜백에서 직접 하고, ResizeObserver 와
   * window resize 는 이후 변화를 따라잡는 보조 수단으로만 쓴다.
   *
   * 사이드바 토글·패널 접힘처럼 창 크기와 무관한 변화도 폭을 바꾸므로
   * resize 이벤트만으로는 부족하다 — 둘 다 걸어 둔다.
   */
  const attachStage = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      // 같은 값이면 참조를 유지해 불필요한 렌더를 막는다
      setBox((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const rect = fitRect(box, active.dimensions);

  return (
    <section className="flex flex-col min-h-0 min-w-0 flex-1" aria-label="이미지 작업 캔버스">
      {/* ── 캔버스 머리글 ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-soft shrink-0">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
          <i
            className={`bx ${
              active.kind === 'original'
                ? 'bx-image'
                : active.kind === 'background'
                  ? 'bx-landscape'
                  : 'bxs-magic-wand'
            } text-base text-indigo-500`}
          />
          {active.label}
        </span>
        {active.dimensions && (
          <span className="text-xs text-fg-subtle font-mono">
            {active.dimensions.width}×{active.dimensions.height}
          </span>
        )}
        {active.provider && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-muted bg-surface-3 rounded-md px-1.5 py-0.5">
            <i className="bx bx-diamond text-xs text-blue-500" />
            {active.provider}
          </span>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={onZoom}
          title="원본 크기로 보기"
          aria-label="원본 크기로 보기"
          className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <i className="bx bx-expand-alt text-lg" />
        </button>
        <button
          type="button"
          onClick={onDownload}
          title="이 이미지 다운로드"
          aria-label="이 이미지 다운로드"
          className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <i className="bx bx-download text-lg" />
        </button>
      </div>

      {/* ── 스테이지 ── */}
      <div
        ref={attachStage}
        className="relative flex-1 min-h-0 min-w-0 bg-surface-2/60 overflow-hidden"
      >
        {rect ? (
          <div className="absolute" style={rect}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={`${active.label} 이미지`}
              className="block w-full h-full select-none"
              draggable={false}
            />
            {elements && (
              <ElementOverlay
                elements={elements}
                instructedIds={instructedIds}
                activeId={editingElementId}
                onPick={onPickElement}
                disabled={locked}
              />
            )}
          </div>
        ) : (
          // 치수 측정 전 한 프레임 — object-contain 으로 먼저 보여 준다
          <div className="absolute inset-0 flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={`${active.label} 이미지`}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        {/* 진행 중 안내 — 캔버스 위에 떠서 어떤 작업이 돌고 있는지 알려준다 */}
        {statusText && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[90%] flex items-center gap-2.5 rounded-full border border-indigo-200 dark:border-indigo-800 bg-surface/95 backdrop-blur-sm shadow-card px-4 py-2">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-60" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-indigo-500" />
            </span>
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 truncate">
              {statusText}
            </p>
          </div>
        )}

        {/* 요소를 아직 안 찾았을 때의 힌트 — 오른쪽 패널의 버튼을 가리킨다 */}
        {!elements && !statusText && (
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-fg-subtle bg-surface/90 rounded-full px-3 py-1.5 border border-border-soft">
            오른쪽 <strong className="font-semibold text-fg-muted">요소 찾기</strong>를 누르면
            수정할 부분을 이 이미지 위에서 바로 고를 수 있어요
          </p>
        )}
      </div>

      {/* ── 버전 레일 ──
          편집이 돌고 있는 동안에도 막지 않는다. 결과를 10초 기다리는 사이 지난
          버전을 들춰 보는 건 안전하고(전송은 호출 시점의 버전을 이미 붙잡았다),
          그걸 막는 게 바로 "기다리는 동안 아무것도 못 한다"는 불편이었다. */}
      {versions.length > 1 && (
        <VersionRail versions={versions} activeId={active.id} onSelect={onSelectVersion} />
      )}
    </section>
  );
}

/**
 * 컨테이너 안에 비율을 지켜 들어가는 이미지의 사각형을 구한다.
 *
 * 확대는 막지 않는다 — 작은 이미지를 원본 크기로만 보여 주면 캔버스 한가운데
 * 조그맣게 떠서 요소 박스를 누르기 어려워진다. 정밀한 화질 확인은 확대(라이트박스)
 * 쪽에서 원본 해상도로 한다.
 */
function fitRect(
  box: { width: number; height: number } | null,
  dimensions: { width: number; height: number } | null,
): Rect | null {
  if (!box || !dimensions) return null;
  if (box.width <= 0 || box.height <= 0) return null;
  if (dimensions.width <= 0 || dimensions.height <= 0) return null;

  // 박스 선택이 가장자리에 딱 붙지 않도록 약간의 여백을 둔다
  const padding = 16;
  const availableWidth = Math.max(box.width - padding * 2, 1);
  const availableHeight = Math.max(box.height - padding * 2, 1);

  const scale = Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;

  return {
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    width,
    height,
  };
}
