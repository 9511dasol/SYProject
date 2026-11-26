'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import InstructionCard from '@/components/image-filter/InstructionCard';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import Button from '@/components/ui/Button';
import type {
  BackgroundStyle,
  FilterFormState,
  ImageDimensions,
  ImageElement,
  Instruction,
  OutputFormat,
} from '@/types/imageFilter';

export type PanelSection = 'elements' | 'backgrounds' | 'settings';

interface InstructionPanelProps {
  instructions: Instruction[];
  elements: ImageElement[] | null;

  onAddInstruction: () => void;
  onEditInstruction: (id: string) => void;
  onDeleteInstruction: (id: string) => void;
  onToggleInstruction: (id: string) => void;

  /** 열려 있는 접이식 섹션 — 툴바에서도 열 수 있어야 해서 상위가 들고 있다 */
  openSection: PanelSection | null;
  onOpenSection: (section: PanelSection | null) => void;

  analyzing: boolean;
  onAnalyze: () => void;
  /** 요소 칩을 누르면 그 요소의 지시를 쓰거나 고친다 */
  onPickElement: (elementId: number) => void;

  backgroundStyles: BackgroundStyle[];
  bgLoading: boolean;
  onSuggestBackgrounds: (styles: string[]) => void;

  form: FilterFormState;
  originalDimensions: ImageDimensions | null;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onToggleAspectRatio: () => void;
  onFormatChange: (format: OutputFormat) => void;

  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
  /** AI 작업이 하나라도 돌고 있는 상태 — 이미지를 바꾸는 동작만 막는다 */
  aiBusy: boolean;
  lastError: string | null;
  onDismissError: () => void;
}

/**
 * 지시 목록과 도구를 모아 둔 오른쪽 패널.
 *
 * 예전에는 요소 선택 · 출력 설정 · 배경 시안이 모두 화면 맨 아래 입력 독 안의
 * 320px 스크롤 박스(`ComposerPanel`)에 들어 있었다. 세 개가 한 자리를 돌려
 * 쓰느라 하나를 열면 나머지가 닫혔고, 지금 무슨 크기로 뽑히는지는 전송한 뒤
 * 칩으로만 알 수 있었다.
 *
 * 전송 버튼이 이 패널에만 있는 것이 중요하다 — 지시 편집 모달은 자동 저장만
 * 하고 전송은 하지 않는다. "자동 저장"이 "자동 전송"으로 새지 않게 하는 구조다.
 */
export default function InstructionPanel({
  instructions,
  elements,
  onAddInstruction,
  onEditInstruction,
  onDeleteInstruction,
  onToggleInstruction,
  openSection,
  onOpenSection,
  analyzing,
  onAnalyze,
  onPickElement,
  backgroundStyles,
  bgLoading,
  onSuggestBackgrounds,
  form,
  originalDimensions,
  onWidthChange,
  onHeightChange,
  onToggleAspectRatio,
  onFormatChange,
  sending,
  onSend,
  onCancel,
  aiBusy,
  lastError,
  onDismissError,
}: InstructionPanelProps) {
  // 생성할 배경 스타일 — 스타일 하나가 이미지 생성 1회라 기본값은 첫 한 종만 켠다
  const [pickedStyles, setPickedStyles] = useState<string[]>([]);
  const effectiveStyles = pickedStyles.length
    ? pickedStyles
    : backgroundStyles.slice(0, 1).map((s) => s.key);

  const hasElement = (id: number) => !!elements?.some((el) => el.id === id);
  // needsTarget: 저장소에서 복구된 지시 — 요소 id 를 믿을 수 없어 대상을 다시 골라야 한다
  const missingTarget = (ins: Instruction) =>
    !!ins.needsTarget || (ins.targetElementId !== null && !hasElement(ins.targetElementId));
  const elementOf = (ins: Instruction) =>
    ins.targetElementId === null
      ? null
      : (elements?.find((el) => el.id === ins.targetElementId) ?? null);

  const sendable = instructions.filter(
    (ins) => ins.enabled && ins.text.trim() && !missingTarget(ins),
  );
  const targetCount = new Set(
    sendable.filter((ins) => ins.targetElementId !== null).map((ins) => ins.targetElementId),
  ).size;

  const width = parseInt(form.targetWidth, 10) || 0;
  const height = parseInt(form.targetHeight, 10) || 0;
  const sizeLabel = width > 0 && height > 0 ? `${width}×${height}` : '원본 크기';

  const instructedIds = new Set(
    instructions.filter((ins) => ins.text.trim()).map((ins) => ins.targetElementId),
  );

  return (
    <aside
      className="flex flex-col w-full lg:w-[420px] xl:w-[440px] shrink-0 min-h-0 border-t lg:border-t-0 lg:border-l border-border bg-surface"
      aria-label="편집 지시"
    >
      {/* ── 스크롤 영역 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 지시 목록 */}
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
              편집 지시
            </h2>
            {instructions.length > 0 && (
              <span className="text-[11px] text-fg-subtle">
                {sendable.length}/{instructions.length} 전송
              </span>
            )}
          </div>

          {instructions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle leading-relaxed">
              아직 지시가 없어요.
              <br />
              아래 버튼이나 이미지 위의 요소를 눌러 작성해 보세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {instructions.map((ins) => (
                <InstructionCard
                  key={ins.id}
                  instruction={ins}
                  element={elementOf(ins)}
                  missingTarget={missingTarget(ins)}
                  onToggle={() => onToggleInstruction(ins.id)}
                  onEdit={() => onEditInstruction(ins.id)}
                  onDelete={() => onDeleteInstruction(ins.id)}
                  disabled={sending}
                />
              ))}
            </ul>
          )}

          <Button
            variant="outline"
            size="md"
            onClick={onAddInstruction}
            disabled={sending}
            className="w-full border-dashed"
          >
            <i className="bx bx-plus text-base" />
            지시 추가
          </Button>
        </div>

        {/* 요소 */}
        <Section
          icon="bx-scan"
          title="요소 찾기"
          badge="Gemini"
          summary={
            elements === null
              ? '아직 분석 안 함'
              : elements.length
                ? `${elements.length}개 찾음`
                : '찾은 요소 없음'
          }
          open={openSection === 'elements'}
          onToggle={() => onOpenSection(openSection === 'elements' ? null : 'elements')}
        >
          <div className="space-y-3">
            <p className="text-[11px] text-fg-subtle leading-relaxed">
              이미지 속 문구·로고·제품을 찾아 이름을 붙여 줍니다. 찾은 뒤에는 캔버스에서
              그 부분만 골라 수정할 수 있어요.
            </p>

            {elements === null || !elements.length ? (
              <Button
                tone="indigo"
                variant="outline"
                size="sm"
                onClick={onAnalyze}
                isLoading={analyzing}
                disabled={aiBusy}
              >
                <i className="bx bx-scan text-base" />
                {elements === null ? '요소 찾기' : '다시 찾기'}
              </Button>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {elements.map((el) => {
                    const written = instructedIds.has(el.id);
                    return (
                      <button
                        key={el.id}
                        type="button"
                        onClick={() => onPickElement(el.id)}
                        disabled={sending}
                        title={written ? '지시를 써 뒀습니다 — 눌러서 수정' : '이 부분만 수정하기'}
                        className={[
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                          'disabled:opacity-50 disabled:pointer-events-none',
                          written
                            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'border-border bg-surface-2 text-fg-muted hover:border-indigo-300 hover:text-fg',
                        ].join(' ')}
                      >
                        {written && <i className="bx bxs-edit text-[10px]" />}
                        {el.label}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAnalyze}
                  isLoading={analyzing}
                  disabled={aiBusy}
                >
                  <i className="bx bx-refresh text-base" />
                  다시 찾기
                </Button>
              </>
            )}
          </div>
        </Section>

        {/* 배경 시안 */}
        <Section
          icon="bx-landscape"
          title="배경 시안"
          badge="Gemini"
          summary={`${effectiveStyles.length}종 선택`}
          open={openSection === 'backgrounds'}
          onToggle={() => onOpenSection(openSection === 'backgrounds' ? null : 'backgrounds')}
        >
          <div className="space-y-3">
            <p className="text-[11px] text-fg-subtle leading-relaxed">
              피사체(제품·인물·문구)는 그대로 두고 배경만 바꾼 시안을 만듭니다.
              <strong className="text-fg-muted font-medium">
                {' '}
                고른 스타일 하나당 AI 이미지 생성이 1회 호출
              </strong>
              되니 필요한 것만 고르세요.
            </p>

            {!backgroundStyles.length && (
              <p className="text-[11px] text-fg-subtle">스타일 목록을 불러오지 못했습니다.</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {backgroundStyles.map((style) => {
                const picked = effectiveStyles.includes(style.key);
                return (
                  <button
                    key={style.key}
                    type="button"
                    disabled={aiBusy}
                    onClick={() =>
                      setPickedStyles((prev) => {
                        const base = prev.length ? prev : effectiveStyles;
                        return base.includes(style.key)
                          ? base.filter((k) => k !== style.key)
                          : [...base, style.key];
                      })
                    }
                    className={[
                      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      'disabled:opacity-50 disabled:pointer-events-none',
                      picked
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium'
                        : 'border-border bg-surface-2 text-fg-muted hover:border-indigo-200 dark:hover:border-indigo-700',
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
                isLoading={bgLoading}
                disabled={aiBusy || !effectiveStyles.length}
              >
                <i className="bx bx-images text-base" />
                {effectiveStyles.length}종 생성
              </Button>
              <span className="text-[11px] text-fg-subtle">
                AI 호출 {effectiveStyles.length}회 · 수십 초 소요
              </span>
            </div>
          </div>
        </Section>

        {/* 출력 설정 */}
        <Section
          icon="bx-slider-alt"
          title="출력 설정"
          summary={`${sizeLabel} · ${form.outputFormat.toUpperCase()}`}
          open={openSection === 'settings'}
          onToggle={() => onOpenSection(openSection === 'settings' ? null : 'settings')}
        >
          {originalDimensions ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg-muted">
                  리사이즈 크기{' '}
                  <span className="font-normal text-fg-subtle">— 편집 완료 후 이 크기로 변환</span>
                </p>
                <DimensionInputs
                  targetWidth={form.targetWidth}
                  targetHeight={form.targetHeight}
                  keepAspectRatio={form.keepAspectRatio}
                  originalDimensions={originalDimensions}
                  onWidthChange={onWidthChange}
                  onHeightChange={onHeightChange}
                  onToggleAspectRatio={onToggleAspectRatio}
                  disabled={sending}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg-muted">출력 포맷</p>
                <FormatSelector
                  value={form.outputFormat}
                  onChange={onFormatChange}
                  disabled={sending}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">이미지 크기를 재는 중입니다…</p>
          )}
        </Section>
      </div>

      {/* ── 전송 영역 (스크롤되지 않는다) ── */}
      <div className="shrink-0 border-t border-border bg-surface-2/60 p-3 space-y-2.5">
        {lastError && (
          <div className="flex items-start gap-2 rounded-xl border border-badge-danger-bdr bg-badge-danger-bg px-3 py-2.5">
            <i className="bx bx-error-circle text-badge-danger-fg text-base shrink-0 mt-px" />
            <p className="flex-1 text-xs text-badge-danger-fg leading-relaxed">{lastError}</p>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="오류 안내 닫기"
              className="shrink-0 text-badge-danger-fg/70 hover:text-badge-danger-fg transition-colors"
            >
              <i className="bx bx-x text-base block" />
            </button>
          </div>
        )}

        {/* 전송 전 요약 — 비용이 드는 행동 앞에 비용을 보여 준다 */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-fg-subtle">
          <span className="font-semibold text-fg-muted">지시 {sendable.length}건</span>
          {targetCount > 0 && <>· 대상 {targetCount}곳</>}
          <>
            · {sizeLabel} {form.outputFormat.toUpperCase()}
          </>
          {sendable.length > 0 && (
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">
              · AI 호출 1회 · 5~10초
            </span>
          )}
        </p>

        {sending ? (
          <Button variant="outline" size="lg" onClick={onCancel} className="w-full">
            <i className="bx bx-stop text-lg" />
            작업 중지
          </Button>
        ) : (
          <Button
            tone="indigo"
            size="lg"
            onClick={onSend}
            disabled={!sendable.length || aiBusy}
            className="w-full"
            title={
              !sendable.length
                ? '보낼 지시가 없습니다 — 지시를 추가하거나 체크를 켜 주세요'
                : `지시 ${sendable.length}건을 한 번에 적용합니다`
            }
          >
            <i className="bx bx-up-arrow-alt text-lg" />
            전송{sendable.length > 0 && ` (${sendable.length}건)`}
          </Button>
        )}
      </div>
    </aside>
  );
}

/* ── 접이식 섹션 ─────────────────────────────────────────────── */

function Section({
  icon,
  title,
  badge,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  badge?: string;
  /** 접혀 있을 때도 현재 상태를 보여 준다 — 열어 보지 않아도 알 수 있게 */
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-border-soft">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
      >
        <i className={`bx ${icon} text-base text-indigo-500 shrink-0`} />
        <span className="text-xs font-semibold text-fg-body">{title}</span>
        {badge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 tracking-wide">
            {badge}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-fg-subtle truncate max-w-32">{summary}</span>
        <i
          className={`bx bx-chevron-down text-lg text-fg-subtle shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && <div className="px-3 pb-3.5">{children}</div>}
    </div>
  );
}
