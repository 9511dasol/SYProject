'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import InstructionCard from '@/components/image-filter/InstructionCard';
import DimensionInputs from '@/components/image-resize/DimensionInputs';
import FormatSelector from '@/components/image-resize/FormatSelector';
import Button from '@/components/ui/Button';
import { controlClassName } from '@/components/ui/Field';
import { readableLogPrompt } from '@/lib/imageFilterPrompt';
import {
  MAX_CUSTOM_BACKGROUNDS,
  MAX_CUSTOM_BACKGROUND_LENGTH,
  MAX_EDIT_VARIANTS,
  MAX_INSTRUCTION_LENGTH,
} from '@/types/imageFilter';
import type {
  BackgroundStyle,
  EditPromptRecord,
  FilterFormState,
  ImageDimensions,
  ImageElement,
  Instruction,
  OutputFormat,
} from '@/types/imageFilter';

export type PanelSection = 'elements' | 'backgrounds' | 'settings' | 'history';

/** "3시간 전"처럼 읽기 — 시각만 보여 주면 언제였는지 가늠이 안 된다 */
function sinceText(iso: string): string {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}


interface InstructionPanelProps {
  instructions: Instruction[];
  elements: ImageElement[] | null;

  /** 모달을 연다 — 긴 글을 쓰거나 대상 요소를 지정할 때만 쓴다 */
  onAddInstruction: () => void;
  /** 입력칸에서 바로 지시 1건을 올린다 (대상은 이미지 전체) */
  onQuickAddInstruction: (text: string) => void;
  onEditInstruction: (id: string) => void;
  onDeleteInstruction: (id: string) => void;
  onToggleInstruction: (id: string) => void;

  /** 열려 있는 접이식 섹션 — 툴바에서도 열 수 있어야 해서 상위가 들고 있다 */
  openSection: PanelSection | null;
  onOpenSection: (section: PanelSection | null) => void;

  /** 내가 과거에 보낸 지시 — null 이면 아직 안 불러온 상태 */
  history: EditPromptRecord[] | null;
  historyError: string | null;

  analyzing: boolean;
  onAnalyze: () => void;
  /** 요소 칩을 누르면 그 요소의 지시를 쓰거나 고친다 */
  onPickElement: (elementId: number) => void;

  backgroundStyles: BackgroundStyle[];
  bgLoading: boolean;
  /** 프리셋 키와 직접 입력한 배경 묘사를 따로 넘긴다 — 서버가 구분자를 달리 쓴다 */
  onSuggestBackgrounds: (styles: string[], customs: string[]) => void;

  form: FilterFormState;
  originalDimensions: ImageDimensions | null;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onToggleAspectRatio: () => void;
  onFormatChange: (format: OutputFormat) => void;
  onVariantCountChange: (count: number) => void;

  /** 이미지 보관 일수 — 서버 설정이 단일 출처, 고지 문구가 어긋나지 않게 받는다 */
  retentionDays: number;

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
 *
 * 푸터의 입력칸은 재설계 때 없앴던 인라인 입력을 되살린 것이다. 당시 문제는
 * 입력칸 자체가 아니라 **써 둔 지시가 보이지도, 수정·삭제되지도 않는다**는 것이었고,
 * 그래서 입력까지 모달로 옮겼다. 지시가 카드 목록으로 드러난 지금은 그 문제가
 * 재발하지 않으므로, 입력은 다시 제자리로 두고 모달은 긴 글·대상 지정 전용으로
 * 남긴다 — 되돌리는 게 아니라 양쪽의 장점을 합치는 구성이다.
 */
export default function InstructionPanel({
  instructions,
  elements,
  onAddInstruction,
  onQuickAddInstruction,
  onEditInstruction,
  onDeleteInstruction,
  onToggleInstruction,
  openSection,
  onOpenSection,
  history,
  historyError,
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
  onVariantCountChange,
  retentionDays,
  sending,
  onSend,
  onCancel,
  aiBusy,
  lastError,
  onDismissError,
}: InstructionPanelProps) {
  /** 푸터 입력칸 — 상설이라 지시가 쌓여도 스크롤 밖으로 밀리지 않는다 */
  const [draft, setDraft] = useState('');
  const draftRef = useRef<HTMLInputElement>(null);

  // 이미지를 붙인 직후 바로 타이핑할 수 있게 포커스를 둔다. 이 패널은 첨부 뒤에만
  // 마운트되므로 마운트 시점이 곧 "첨부 직후"다. 모달을 자동으로 띄우지는 않는다 —
  // 캔버스를 덮어 요소 지정 동선을 가로막기 때문이다.
  useEffect(() => {
    draftRef.current?.focus();
  }, []);

  // 생성할 배경 스타일 — 스타일 하나가 이미지 생성 1회라 기본값은 첫 한 종만 켠다
  const [pickedStyles, setPickedStyles] = useState<string[]>([]);
  /** 프리셋에 없는 배경을 직접 적어 둔 목록 — 적은 문장이 그대로 시안 이름이 된다 */
  const [customStyles, setCustomStyles] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  /** 중복·개수 초과를 알리는 한 줄 — 입력칸 아래에만 뜬다 */
  const [customNotice, setCustomNotice] = useState<string | null>(null);

  // 아무것도 고르지 않았을 때 첫 프리셋을 켜 두는 건 "생성 버튼이 늘 눌린다"를 위한
  // 것이다. 직접 입력한 배경이 있으면 그 암묵적 기본값을 뗀다 — 적어 둔 배경 하나를
  // 만들려고 눌렀는데 요청한 적 없는 프리셋 1장이 함께 과금되면 안 된다.
  const effectiveStyles = pickedStyles.length
    ? pickedStyles
    : customStyles.length
      ? []
      : backgroundStyles.slice(0, 1).map((s) => s.key);
  const totalStyles = effectiveStyles.length + customStyles.length;

  /**
   * 입력칸의 내용을 목록에 넣는다 (엔터 · 추가 버튼 공통).
   *
   * 공백·줄바꿈을 한 칸으로 접는 이유 — 서버로는 줄바꿈으로 나눠 보내므로, 붙여넣기로
   * 들어온 줄바꿈을 그대로 두면 한 건이 여러 건으로 쪼개져 호출 수가 늘어난다.
   */
  const commitCustom = () => {
    const text = customDraft.trim().replace(/\s+/g, ' ').slice(0, MAX_CUSTOM_BACKGROUND_LENGTH);
    if (!text) return;

    if (customStyles.includes(text)) {
      setCustomDraft('');
      setCustomNotice('이미 추가한 배경이에요.');
      return;
    }
    if (customStyles.length >= MAX_CUSTOM_BACKGROUNDS) {
      setCustomNotice(`직접 입력은 ${MAX_CUSTOM_BACKGROUNDS}개까지 추가할 수 있어요.`);
      return;
    }

    setCustomStyles((prev) => [...prev, text]);
    setCustomDraft('');
    setCustomNotice(null);
  };

  /**
   * 입력칸 내용을 지시 1건으로 올린다 (엔터 · 추가 버튼 공통).
   *
   * 줄바꿈을 한 칸으로 접는다 — 이미지 전체 지시는 `\n` 으로 이어 붙여 모델에
   * 보내므로(`composeEditPrompt`), 붙여넣기로 들어온 줄바꿈을 그대로 두면 한 건이
   * 여러 건처럼 읽힌다. 여러 줄을 의도적으로 쓰려면 모달을 쓴다.
   */
  const commitDraft = () => {
    const text = draft.trim().replace(/\s+/g, ' ');
    if (!text) return;
    onQuickAddInstruction(text);
    setDraft('');
  };

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
              아래 입력칸에 바로 쓰거나, 이미지 위의 요소를 눌러 그 부분만 고쳐 보세요.
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
          summary={`${totalStyles}종 선택`}
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

            {/* 직접 입력 — 프리셋 네 가지로는 "우리 제품에 어울리는 배경"을 못 적는다 */}
            <div className="space-y-1.5 rounded-xl border border-border-soft bg-surface-2/50 p-2.5">
              <label
                htmlFor="custom-bg-input"
                className="block text-[11px] font-semibold text-fg-muted"
              >
                배경 직접 입력{' '}
                <span className="font-normal text-fg-subtle">
                  — 엔터를 누르면 추가됩니다 (최대 {MAX_CUSTOM_BACKGROUNDS}개)
                </span>
              </label>

              <div className="flex items-center gap-1.5">
                <input
                  id="custom-bg-input"
                  type="text"
                  value={customDraft}
                  maxLength={MAX_CUSTOM_BACKGROUND_LENGTH}
                  placeholder="예: 벚꽃이 흩날리는 봄 공원"
                  disabled={aiBusy}
                  onChange={(event) => {
                    setCustomDraft(event.target.value);
                    setCustomNotice(null);
                  }}
                  // 한글 입력 중의 엔터는 조합을 확정하는 키다 — isComposing 을 보지
                  // 않으면 마지막 글자를 확정하는 순간 그대로 추가돼 버린다.
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    commitCustom();
                  }}
                  className={`${controlClassName} min-w-0 flex-1 px-3 py-2 text-xs`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={commitCustom}
                  disabled={aiBusy || !customDraft.trim()}
                  aria-label="직접 입력한 배경 추가"
                  className="shrink-0"
                >
                  <i className="bx bx-plus text-base" />
                </Button>
              </div>

              {customNotice && <p className="text-[11px] text-amber-600 dark:text-amber-400">{customNotice}</p>}

              {customStyles.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-0.5">
                  {customStyles.map((text) => (
                    <li key={text}>
                      {/* 직접 적은 건 켜고 끄는 대상이 아니다 — 지우는 것으로 충분하다 */}
                      <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 pl-2.5 pr-1 py-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                        <span className="truncate" title={text}>
                          {text}
                        </span>
                        <button
                          type="button"
                          disabled={aiBusy}
                          onClick={() => {
                            setCustomStyles((prev) => prev.filter((item) => item !== text));
                            setCustomNotice(null);
                          }}
                          aria-label={`"${text}" 배경 지우기`}
                          className="shrink-0 rounded p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                        >
                          <i className="bx bx-x text-sm block" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                tone="indigo"
                size="sm"
                onClick={() => onSuggestBackgrounds(effectiveStyles, customStyles)}
                isLoading={bgLoading}
                disabled={aiBusy || !totalStyles}
              >
                <i className="bx bx-images text-base" />
                {totalStyles}종 생성
              </Button>
              <span className="text-[11px] text-fg-subtle">
                AI 호출 {totalStyles}회 · 수십 초 소요
              </span>
            </div>
          </div>
        </Section>

        {/* 지난 기록 — 열 때만 불러온다. 화면을 열 때마다 조회하면 쓰지도 않는
            사람에게 매번 요청이 나간다. */}
        <Section
          icon="bx-history"
          title="지난 기록"
          summary={history === null ? '아직 안 불러옴' : `${history.length}건`}
          open={openSection === 'history'}
          onToggle={() => onOpenSection(openSection === 'history' ? null : 'history')}
        >
          <div className="space-y-2">
            <p className="text-[11px] text-fg-subtle leading-relaxed">
              내가 보낸 편집 지시입니다. 눌러서 입력칸에 그대로 불러올 수 있어요.
            </p>

            {historyError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{historyError}</p>
            )}

            {history === null ? (
              <p className="text-[11px] text-fg-subtle">불러오는 중…</p>
            ) : !history.length ? (
              <p className="text-[11px] text-fg-subtle">아직 보낸 지시가 없어요.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((record) => {
                  const text = readableLogPrompt(record.prompt);
                  return (
                    <li key={record.id}>
                      <button
                        type="button"
                        onClick={() => setDraft(text.slice(0, MAX_INSTRUCTION_LENGTH))}
                        disabled={sending}
                        title="입력칸에 불러오기"
                        className={[
                          'w-full rounded-xl border border-border bg-surface-2 px-2.5 py-2 text-left',
                          'hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors',
                          'disabled:opacity-50 disabled:pointer-events-none',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
                          <i className="bx bx-time-five" />
                          {sinceText(record.created_at)}
                          {record.image_filename && (
                            <span className="truncate">· {record.image_filename}</span>
                          )}
                        </span>
                        {/* 좌표 설명이 붙은 긴 지시도 있어 세 줄에서 자른다 */}
                        <span className="mt-0.5 block text-xs text-fg-body line-clamp-3 wrap-break-word">
                          {text}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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

              {/* 시안 장수 — 한 장이 이미지 생성 1회다. 올리면 비용이 같이 오른다는
                  사실을 숫자 옆에 바로 붙여 둔다(전송 전 요약에서 한 번 더 보여 준다). */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg-muted">
                  시안 장수{' '}
                  <span className="font-normal text-fg-subtle">
                    — 같은 지시로 여러 장을 만들어 고릅니다
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: MAX_EDIT_VARIANTS }, (_, i) => i + 1).map((n) => {
                    const picked = form.variantCount === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onVariantCountChange(n)}
                        disabled={sending}
                        aria-pressed={picked}
                        title={`${n}장 — AI 호출 ${n}회`}
                        className={[
                          'w-9 rounded-lg border py-1.5 text-xs tabular-nums transition-colors',
                          'disabled:opacity-50 disabled:pointer-events-none',
                          picked
                            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold'
                            : 'border-border bg-surface-2 text-fg-muted hover:border-indigo-200 dark:hover:border-indigo-700',
                        ].join(' ')}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-fg-subtle leading-relaxed">
                  한 장이 AI 이미지 생성 1회입니다 —{' '}
                  <strong className="text-fg-muted font-medium">
                    {form.variantCount}장이면 토큰도 {form.variantCount}배
                  </strong>{' '}
                  듭니다.
                </p>
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

        {/* 상설 입력칸 — 모달을 열지 않고 바로 쓴다.
            스크롤 영역이 아니라 고정 푸터에 둔 이유: 예전에는 `지시 추가` 버튼이
            지시 목록 아래에 있어서 지시가 쌓이면 버튼이 스크롤 밖으로 밀렸다. */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              ref={draftRef}
              id="instruction-draft-input"
              type="text"
              value={draft}
              maxLength={MAX_INSTRUCTION_LENGTH}
              placeholder="예: 배경을 하얗게 바꿔줘"
              disabled={sending}
              aria-label="이미지 전체에 적용할 지시"
              onChange={(event) => setDraft(event.target.value)}
              // 한글 입력 중의 엔터는 조합을 확정하는 키다 — isComposing 을 보지
              // 않으면 마지막 글자를 확정하는 순간 그대로 추가돼 버린다.
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                commitDraft();
              }}
              className={`${controlClassName} min-w-0 flex-1 px-3 py-2 text-xs`}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={commitDraft}
              disabled={sending || !draft.trim()}
              aria-label="지시 추가"
              className="shrink-0"
            >
              <i className="bx bx-plus text-base" />
            </Button>
          </div>

          <p className="flex items-center gap-1 text-[11px] text-fg-subtle">
            엔터로 추가됩니다 · 이미지 전체에 적용
            <span className="flex-1" />
            {/* 긴 글·대상 지정은 모달로 — 기본 동선에서는 빠진다 */}
            <button
              type="button"
              onClick={onAddInstruction}
              disabled={sending}
              className="inline-flex items-center gap-0.5 font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 disabled:pointer-events-none"
            >
              <i className="bx bx-expand-alt text-xs" />
              자세히 쓰기
            </button>
          </p>
        </div>

        {/* 전송 전 요약 — 비용이 드는 행동 앞에 비용을 보여 준다 */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-fg-subtle">
          <span className="font-semibold text-fg-muted">지시 {sendable.length}건</span>
          {targetCount > 0 && <>· 대상 {targetCount}곳</>}
          <>
            · {sizeLabel} {form.outputFormat.toUpperCase()}
          </>
          {sendable.length > 0 && (
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">
              · 시안 {form.variantCount}장 · AI 호출 {form.variantCount}회 · 5~10초
            </span>
          )}
        </p>

        {/* 보관 고지 — 결과물이 서버에 올라가는 사실은 누르기 **전에** 알린다.
            "서버에 저장하지 않는다"가 원칙이던 화면이라, 바뀐 약속을 조용히
            지나치면 화면이 거짓을 말하게 된다 (2026-11-28 보관 시작). */}
        <p className="text-[11px] text-fg-subtle leading-relaxed">
          완성된 시안은 지난 작업에 <strong className="text-fg-muted font-medium">{retentionDays}일
          보관</strong>된 뒤 자동 삭제돼요 — 기록에서 다시 보고, 언제든 직접 지울 수 있어요.
          올린 원본은 저장하지 않습니다.
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
