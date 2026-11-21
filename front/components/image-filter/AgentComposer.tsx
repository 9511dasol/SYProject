'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import ElementPicker from '@/components/image-filter/ElementPicker';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import Button from '@/components/ui/Button';
import type {
  BackgroundStyle,
  ImageDimensions,
  ImageElement,
  OutputFormat,
} from '@/types/imageFilter';

export const MAX_PROMPT_LENGTH = 500;

type Panel = 'elements' | 'settings' | 'backgrounds' | null;

interface AgentComposerProps {
  file: File | null;
  previewUrl: string | null;
  originalDimensions: ImageDimensions | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  onAttach: (file: File) => void;
  onClearFile: () => void;
  targetWidth: string;
  targetHeight: string;
  keepAspectRatio: boolean;
  outputFormat: OutputFormat;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onToggleAspectRatio: () => void;
  onFormatChange: (format: OutputFormat) => void;
  elements: ImageElement[] | null;
  selectedElementId: number | null;
  onSelectElement: (id: number | null) => void;
  /** 작성해 둔 프롬프트가 있는 요소 — 선택 목록에 표시해 준다 */
  draftedElementIds: Set<number>;
  /** 지금 칸 말고 다른 대상에 써 둔 지시들 — 전송하면 함께 적용된다 */
  pendingLabels: string[];
  analyzing: boolean;
  /** 요소 분석을 수행하고 성공 여부를 돌려준다 — 성공 시 패널을 연 채로 둔다. */
  onAnalyze: () => Promise<boolean>;
  /** 고를 수 있는 배경 스타일 — 비어 있으면 아직 목록을 못 받은 상태 */
  backgroundStyles: BackgroundStyle[];
  onSuggestBackgrounds: (styles: string[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}

/**
 * 에이전트 채팅형 프롬프트 컴포저 — 화면 하단에 고정되는 입력 독.
 *
 * 이미지 첨부·요소 선택·출력 설정·배경 시안이 전부 도구 버튼으로 이 안에
 * 모여 있다. Enter 전송(한글 IME 조합 중에는 무시), Shift+Enter 줄바꿈,
 * 클립보드 이미지 붙여넣기를 지원한다.
 */
export default function AgentComposer({
  file,
  previewUrl,
  originalDimensions,
  prompt,
  onPromptChange,
  onAttach,
  onClearFile,
  targetWidth,
  targetHeight,
  keepAspectRatio,
  outputFormat,
  onWidthChange,
  onHeightChange,
  onToggleAspectRatio,
  onFormatChange,
  elements,
  selectedElementId,
  onSelectElement,
  draftedElementIds,
  pendingLabels,
  analyzing,
  onAnalyze,
  backgroundStyles,
  onSuggestBackgrounds,
  onSubmit,
  onCancel,
  busy,
}: AgentComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<Panel>(null);

  // Safari 는 한글 조합 확정 Enter 에서 compositionend 를 keydown 보다 먼저
  // 보내 isComposing 이 false 다 — 조합 종료 직후의 Enter 는 전송으로 치지 않는다.
  const compositionEndedAtRef = useRef(0);

  // 생성할 배경 스타일 — 스타일 하나가 이미지 생성 1회라 기본값은 첫 한 종만 켠다
  const [pickedStyles, setPickedStyles] = useState<string[]>([]);
  const effectiveStyles = pickedStyles.length
    ? pickedStyles
    : backgroundStyles.slice(0, 1).map((s) => s.key);

  const selectedElement = elements?.find((el) => el.id === selectedElementId) ?? null;
  // 지금 칸이 비어 있어도 다른 대상에 써 둔 지시가 있으면 그걸 보낼 수 있다
  const canSend = !!file && (!!prompt.trim() || pendingLabels.length > 0) && !busy;
  const sendsPendingOnly = !prompt.trim() && pendingLabels.length > 0;
  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : null;

  /* 입력 길이에 맞춰 높이를 늘린다 — 예시 클릭으로 외부에서 채워질 때도 맞춰야
     하므로 이벤트가 아니라 값 변화에 반응한다. */
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [prompt]);

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onAttach(f);
    e.target.value = '';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 확정 Enter 가 전송으로 새면 안 된다 (Safari 는 isComposing 이
    // false 로 오므로 compositionend 직후 50ms 는 조합 확정으로 취급)
    const justComposed = performance.now() - compositionEndedAtRef.current < 50;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !justComposed) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (busy) return; // 버튼·드래그처럼 작업 중 교체를 막는다 — 분석 결과가 새 이미지에 붙는다
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const pasted = item?.getAsFile();
    if (pasted) {
      e.preventDefault();
      onAttach(pasted);
    }
  };

  const handleElementsClick = async () => {
    if (!file || busy) return;
    if (elements === null) {
      setPanel('elements'); // 분석 중 로딩을 패널 안에서 보여준다
      const ok = await onAnalyze();
      if (!ok) setPanel((p) => (p === 'elements' ? null : p));
    } else {
      setPanel((p) => (p === 'elements' ? null : 'elements'));
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden transition-all focus-within:border-indigo-300 dark:focus-within:border-indigo-700 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/50">
        {/* ── 확장 패널 ── */}
        {panel === 'elements' && (
          <ComposerPanel icon="bx-scan" title="요소 선택" badge="Gemini" onClose={() => setPanel(null)}>
            {analyzing ? (
              <div className="flex items-center gap-3 py-4 text-sm text-fg-muted">
                <span className="w-4 h-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin shrink-0" />
                이미지 속 요소(문구·로고·제품 등)를 찾는 중...
              </div>
            ) : elements && previewUrl ? (
              <div className="space-y-3">
                <ElementPicker
                  previewUrl={previewUrl}
                  elements={elements}
                  selectedId={selectedElementId}
                  onSelect={onSelectElement}
                  draftedIds={draftedElementIds}
                  disabled={busy}
                />
                {elements.length === 0 && (
                  <p className="text-xs text-fg-subtle">
                    선택할 수 있는 요소를 찾지 못했어요. 프롬프트로 이미지 전체를 편집할 수 있습니다.
                  </p>
                )}
              </div>
            ) : null}
          </ComposerPanel>
        )}

        {panel === 'backgrounds' && (
          <ComposerPanel
            icon="bx-landscape"
            title="배경 시안 만들기"
            badge="Gemini"
            onClose={() => setPanel(null)}
          >
            <div className="space-y-3">
              <p className="text-xs text-fg-subtle leading-relaxed">
                피사체(제품·인물·문구)는 그대로 두고 배경만 바꾼 시안을 만듭니다.
                <strong className="text-fg-muted font-medium">
                  {' '}
                  고른 스타일 하나당 AI 이미지 생성이 1회 호출
                </strong>
                되니 필요한 것만 고르세요.
              </p>

              {!backgroundStyles.length && (
                <p className="text-xs text-fg-subtle">스타일 목록을 불러오지 못했습니다.</p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {backgroundStyles.map((style) => {
                  const picked = effectiveStyles.includes(style.key);
                  return (
                    <button
                      key={style.key}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPickedStyles((prev) => {
                          const base = prev.length ? prev : effectiveStyles;
                          return base.includes(style.key)
                            ? base.filter((k) => k !== style.key)
                            : [...base, style.key];
                        })
                      }
                      className={[
                        'inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                        picked
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 font-medium'
                          : 'bg-surface-2 text-fg-muted border-border hover:border-indigo-200 dark:hover:border-indigo-700',
                        'disabled:opacity-50 disabled:pointer-events-none',
                      ].join(' ')}
                    >
                      <i className={`bx ${picked ? 'bxs-check-circle' : 'bx-circle'} text-sm`} />
                      {style.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  tone="indigo"
                  size="sm"
                  onClick={() => onSuggestBackgrounds(effectiveStyles)}
                  disabled={busy || !effectiveStyles.length}
                >
                  <i className="bx bx-images text-base" />
                  {effectiveStyles.length}종 생성하기
                </Button>
                <span className="text-[11px] text-fg-subtle">
                  AI 호출 {effectiveStyles.length}회 · 수십 초 소요
                </span>
              </div>
            </div>
          </ComposerPanel>
        )}

        {panel === 'settings' && originalDimensions && (
          <ComposerPanel icon="bx-slider-alt" title="출력 설정" onClose={() => setPanel(null)}>
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg-muted">
                  리사이즈 크기 <span className="font-normal text-fg-subtle">— 편집 완료 후 이 크기로 변환됩니다</span>
                </p>
                <DimensionInputs
                  targetWidth={targetWidth}
                  targetHeight={targetHeight}
                  keepAspectRatio={keepAspectRatio}
                  originalDimensions={originalDimensions}
                  onWidthChange={onWidthChange}
                  onHeightChange={onHeightChange}
                  onToggleAspectRatio={onToggleAspectRatio}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg-muted">출력 포맷</p>
                <FormatSelector value={outputFormat} onChange={onFormatChange} disabled={busy} />
              </div>
            </div>
          </ComposerPanel>
        )}

        {/* ── 첨부 이미지 · 대상 요소 칩 ── */}
        {file && previewUrl && (
          <div className="flex items-center gap-2 flex-wrap px-3 pt-3">
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-border pl-1.5 pr-1 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file.name}
                className="w-9 h-9 rounded-lg object-cover border border-border bg-surface-3"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-fg truncate max-w-36 sm:max-w-52">{file.name}</p>
                <p className="text-[10px] text-fg-subtle">
                  {fileSizeMB} MB
                  {originalDimensions && ` · ${originalDimensions.width}×${originalDimensions.height}px`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClearFile}
                disabled={busy}
                title="첨부 해제"
                aria-label="첨부 이미지 해제"
                className="p-1 rounded-lg text-fg-subtle hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
              >
                <i className="bx bx-x text-lg" />
              </button>
            </div>

            {selectedElement && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-200 dark:ring-indigo-800 text-indigo-600 dark:text-indigo-400 pl-2.5 pr-1 py-1 text-xs font-medium">
                <i className="bx bx-target-lock text-sm" />
                대상: {selectedElement.label}
                <button
                  type="button"
                  onClick={() => onSelectElement(null)}
                  disabled={busy}
                  title="대상 요소 해제"
                  aria-label="대상 요소 해제"
                  className="p-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                >
                  <i className="bx bx-x text-sm block" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* ── 프롬프트 입력 ── */}
        <textarea
          ref={textRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionEnd={() => {
            compositionEndedAtRef.current = performance.now();
          }}
          onPaste={handlePaste}
          rows={1}
          maxLength={MAX_PROMPT_LENGTH}
          aria-label="편집 프롬프트 입력"
          placeholder={
            file
              ? sendsPendingOnly
                ? '더 지시할 게 없으면 그대로 전송하세요'
                : selectedElement
                  ? `"${selectedElement.label}" 요소를 어떻게 바꿀까요?`
                  : '이미지를 어떻게 바꿀까요? 예) 배경을 스튜디오 흰 배경으로 바꿔줘'
              : '이미지를 첨부하고 편집 지시를 입력하세요'
          }
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
        />

        {/* 다른 대상에 써 둔 지시 — 지금 칸이 비어 있어도 전송하면 함께 적용된다 */}
        {pendingLabels.length > 0 && (
          <p className="flex items-start gap-1.5 px-4 pb-1 text-[11px] text-indigo-500 dark:text-indigo-400">
            <i className="bx bx-list-check text-sm shrink-0" />
            <span>
              작성해 둔 지시 {pendingLabels.length}건({pendingLabels.join(', ')})을 함께 보냅니다
            </span>
          </p>
        )}

        {/* ── 도구 모음 ── */}
        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
          <ToolButton
            icon="bx-image-add"
            label={file ? '교체' : '이미지'}
            title="이미지 첨부 (드래그·붙여넣기 가능)"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          />
          {file && (
            <>
              <ToolButton
                icon="bx-scan"
                label="요소 선택"
                title="AI가 찾은 요소 중 수정할 부분만 고르기"
                active={panel === 'elements' || selectedElementId !== null}
                loading={analyzing}
                onClick={handleElementsClick}
                disabled={busy && !analyzing}
              />
              <ToolButton
                icon="bx-slider-alt"
                label="출력 설정"
                title="리사이즈 크기 · 출력 포맷"
                active={panel === 'settings'}
                onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
                disabled={busy || !originalDimensions}
              />
              <ToolButton
                icon="bx-landscape"
                label="배경 시안"
                title="피사체는 그대로, 배경만 바꾼 시안 생성 (고른 스타일 수만큼 AI 호출)"
                active={panel === 'backgrounds'}
                onClick={() => setPanel((p) => (p === 'backgrounds' ? null : 'backgrounds'))}
                disabled={busy}
              />
            </>
          )}

          <div className="flex-1" />

          <span className="hidden sm:block text-[10px] text-fg-disabled select-none mr-1">
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </span>

          {busy ? (
            <button
              type="button"
              onClick={onCancel}
              title="작업 중지"
              aria-label="작업 중지"
              className="w-9 h-9 rounded-full bg-surface-3 text-fg-muted hover:bg-red-100 dark:hover:bg-red-950/60 hover:text-red-500 flex items-center justify-center transition-colors shrink-0"
            >
              <i className="bx bx-stop text-xl" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              title={
                !file
                  ? '이미지를 먼저 첨부하세요'
                  : !canSend
                    ? '프롬프트를 입력하세요'
                    : sendsPendingOnly
                      ? `작성해 둔 지시 ${pendingLabels.length}건을 함께 적용합니다 (Enter)`
                      : '전송 (Enter)'
              }
              aria-label="편집 요청 전송"
              className="w-9 h-9 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-surface-3 disabled:text-fg-disabled flex items-center justify-center transition-colors shrink-0 active:scale-95"
            >
              <i className="bx bx-up-arrow-alt text-xl" />
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-fg-subtle select-none">
        이미지는 서버에 저장되지 않아요 · <kbd className="font-sans">Enter</kbd> 전송 ·{' '}
        <kbd className="font-sans">Shift+Enter</kbd> 줄바꿈
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handlePick}
        disabled={busy}
      />
    </div>
  );
}

/* ── 내부 소형 컴포넌트 ──────────────────────────────────────── */

function ComposerPanel({
  icon,
  title,
  badge,
  onClose,
  children,
}: {
  icon: string;
  title: string;
  badge?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <i className={`bx ${icon} text-base text-indigo-500`} />
        <span className="text-sm font-semibold text-fg-body">{title}</span>
        {badge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 tracking-wide">
            {badge}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          title="패널 닫기"
          aria-label="패널 닫기"
          className="p-1 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <i className="bx bx-x text-lg" />
        </button>
      </div>
      <div className="px-4 pb-4 pt-3 max-h-80 overflow-y-auto">{children}</div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  title,
  onClick,
  active = false,
  loading = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800'
          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        'disabled:opacity-40 disabled:pointer-events-none',
      ].join(' ')}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
      ) : (
        <i className={`bx ${icon} text-base`} />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
