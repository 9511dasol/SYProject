'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Select } from '@/components/ui/Field';
import { boxText, suggestionsFor } from '@/lib/imageFilterPrompt';
import { MAX_INSTRUCTION_LENGTH } from '@/types/imageFilter';
import type { ImageElement, Instruction } from '@/types/imageFilter';

/** 저장할 내용 — 호출부가 지시에 반영한다 */
export interface InstructionPatch {
  text: string;
  targetElementId: number | null;
}

interface InstructionEditorModalProps {
  /** 모달을 열 때의 스냅샷. 되돌리기의 기준점이기도 하다 */
  instruction: Instruction;
  /** 이번에 새로 만든 지시인지 — 삭제 버튼 문구와 빈 내용 처리가 달라진다 */
  isNew: boolean;
  elements: ImageElement[] | null;
  previewUrl: string;
  /**
   * 닫힘(밖 클릭·Esc·X·저장) 시 호출된다. 호출부가 저장 + 실행취소 토스트를 맡는다.
   * 내용이 비어 있으면 빈 문자열이 그대로 넘어온다 — "비우면 삭제"는 호출부 정책.
   */
  onSave: (patch: InstructionPatch) => void;
  /** 되돌리기 — 열었을 때 값으로 복원하고 닫는다 */
  onRevert: () => void;
  onDelete: () => void;
}

/**
 * 지시 한 건을 넉넉한 화면에서 쓰고 고친다.
 *
 * 예전에는 이 작업을 화면 맨 아래 입력 독의 `rows={1}` textarea(최대 160px)에서
 * 했다. 500자를 쓸 수 있는 칸인데 네 줄만 보이고, 글자 수 카운터는 모바일에서
 * 숨겨져 있었다. 무엇보다 다른 요소에 써 둔 지시를 고치려면 그 요소를 다시 골라
 * 같은 칸으로 돌아오는 수밖에 없었다.
 *
 * 닫는 방법 세 가지(밖 클릭 · Esc · X)가 모두 **저장**이다. Esc 를 취소로 두는
 * 게 일반 관례지만, 같은 모달에서 닫는 방법마다 결과가 달라지면 "내가 아까 밖을
 * 눌렀나 Esc 를 눌렀나"를 기억해야 한다. 그래서 전부 저장으로 통일하고, 취소는
 * `[되돌리기]` 와 저장 직후 토스트의 `실행취소` 로만 제공한다.
 */
export default function InstructionEditorModal({
  instruction,
  isNew,
  elements,
  previewUrl,
  onSave,
  onRevert,
  onDelete,
}: InstructionEditorModalProps) {
  const [text, setText] = useState(instruction.text);
  const [targetId, setTargetId] = useState<number | null>(instruction.targetElementId);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const target = useMemo(
    () => elements?.find((el) => el.id === targetId) ?? null,
    [elements, targetId],
  );
  const suggestions = useMemo(() => suggestionsFor(target), [target]);

  const dirty = text !== instruction.text || targetId !== instruction.targetElementId;

  /* 입력 길이에 맞춰 높이를 늘린다 — 예시 칩으로 외부에서 채워질 때도 맞춰야
     하므로 이벤트가 아니라 값 변화에 반응한다. */
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);

  /**
   * 닫기 = 저장.
   *
   * state 대신 DOM 값을 함께 읽는 이유 — 한글 IME 조합이 끝나지 않은 상태에서
   * 모달 밖을 클릭하면 일부 브라우저가 마지막 조합 글자의 onChange 를 보내지
   * 않는다. 그대로 저장하면 사용자가 방금 입력한 글자가 조용히 사라진다.
   *
   * 클로저가 낡을 걱정은 없다 — Modal 은 onClose 가 바뀔 때마다 Escape 리스너를
   * 다시 걸고 오버레이·닫기 버튼 핸들러도 매 렌더 새로 그린다.
   */
  const handleDismiss = () => {
    const live = textRef.current?.value ?? '';
    onSave({
      text: live.length >= text.length ? live : text,
      targetElementId: targetId,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 큰 입력칸이므로 Enter 는 줄바꿈이 맞다. 저장은 Ctrl/⌘+Enter.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleDismiss();
    }
  };

  const appendSuggestion = (suggestion: string) => {
    setText((prev) => {
      const next = prev.trim() ? `${prev.trim()} ${suggestion}` : suggestion;
      return next.slice(0, MAX_INSTRUCTION_LENGTH);
    });
    textRef.current?.focus();
  };

  return (
    <Modal
      open
      onClose={handleDismiss}
      size="xl"
      icon={target ? 'bx-target-lock' : 'bx-image'}
      initialFocusRef={textRef}
      title={
        <span className="truncate">
          {isNew ? '지시 추가' : '지시 수정'}
          {target ? ` — "${target.label}"` : ' — 이미지 전체'}
        </span>
      }
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" tone="danger" size="sm" onClick={onDelete}>
              <i className="bx bx-trash text-sm" />
              지시 삭제
            </Button>
          )}
          {dirty && (
            <Button variant="ghost" size="sm" onClick={onRevert}>
              <i className="bx bx-undo text-base" />
              되돌리기
            </Button>
          )}
          <span className="flex-1 hidden sm:block text-[11px] text-fg-subtle leading-snug">
            밖을 누르거나 <kbd className="font-sans font-semibold">Esc</kbd> 를 눌러도 자동
            저장돼요. 전송은 따로 눌러야 합니다.
          </span>
          <Button tone="indigo" size="sm" onClick={handleDismiss}>
            <i className="bx bx-check text-base" />
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── 대상 ── */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="shrink-0">
            <div className="relative inline-block rounded-xl overflow-hidden border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="편집 대상 미리보기"
                className="block max-h-40 w-auto max-w-full"
              />
              {/* 전체 맥락을 보여 주면서 대상만 밝게 남긴다 — 크롭해 버리면 "이게
                  어디 있던 문구였지"를 다시 떠올려야 한다.
                  안쪽 이미지는 바깥과 같은 배율로 깔아 대상 영역만 또렷하게 보인다:
                  박스 폭이 원본의 w 배이므로 width 를 100/w % 로 두면 두 이미지의
                  렌더 크기가 정확히 같아지고, left 를 -x/w*100 % 로 밀면 맞물린다
                  (퍼센트 left 는 박스 폭 기준이라 -x/w*100% × w·CW = -x·CW). */}
              {target && (
                <>
                  <div className="absolute inset-0 bg-black/50" />
                  <div
                    className="absolute overflow-hidden rounded-sm ring-2 ring-indigo-400"
                    style={{
                      left: `${target.box.x * 100}%`,
                      top: `${target.box.y * 100}%`,
                      width: `${target.box.w * 100}%`,
                      height: `${target.box.h * 100}%`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt=""
                      className="absolute max-w-none"
                      style={{
                        width: `${100 / Math.max(target.box.w, 0.001)}%`,
                        height: `${100 / Math.max(target.box.h, 0.001)}%`,
                        left: `${(-target.box.x / Math.max(target.box.w, 0.001)) * 100}%`,
                        top: `${(-target.box.y / Math.max(target.box.h, 0.001)) * 100}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <Select
              label="수정 대상"
              value={targetId === null ? 'all' : String(targetId)}
              onChange={(e) =>
                setTargetId(e.target.value === 'all' ? null : Number(e.target.value))
              }
              hint={
                target
                  ? `${boxText(target)}만 수정하고 나머지는 원본 그대로 둡니다.`
                  : '이미지 전체에 적용되는 지시입니다.'
              }
            >
              <option value="all">이미지 전체</option>
              {elements?.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.label}
                </option>
              ))}
            </Select>

            {instruction.needsTarget && (
              <p className="flex items-start gap-1.5 rounded-lg border border-badge-warn-bdr bg-badge-warn-bg px-2.5 py-2 text-[11px] text-badge-warn-fg leading-relaxed">
                <i className="bx bx-error-circle text-sm shrink-0 mt-px" />
                <span>
                  복구한 지시입니다
                  {instruction.targetHint && (
                    <>
                      {' '}
                      — 이전 대상은 <strong>{instruction.targetHint}</strong> 였어요
                    </>
                  )}
                  . 요소 번호는 이미지마다 새로 매겨지므로 대상을 다시 골라 주세요.
                </span>
              </p>
            )}

            {!elements && (
              <p className="flex items-start gap-1.5 text-[11px] text-fg-subtle leading-relaxed">
                <i className="bx bx-info-circle text-sm shrink-0 mt-px" />
                아직 요소를 찾지 않았습니다. 대화 열의 <strong>요소 찾기</strong>를 쓰면
                특정 부분만 골라 수정할 수 있어요.
              </p>
            )}
          </div>
        </div>

        {/* ── 지시문 ── */}
        <div className="space-y-1.5">
          <label htmlFor="instruction-text" className="block text-xs font-semibold text-fg-muted">
            어떻게 바꿀까요?
          </label>
          <textarea
            id="instruction-text"
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_INSTRUCTION_LENGTH}
            placeholder={
              target
                ? `예) "${target.label}" 을(를) 어떻게 바꿀지 적어 주세요`
                : '예) 배경을 스튜디오 흰 배경으로 바꾸고 전체적으로 화사하게 보정해줘'
            }
            className="w-full min-h-[220px] resize-none rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-shadow"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-fg-subtle">
              <kbd className="font-sans font-semibold">Enter</kbd> 줄바꿈 ·{' '}
              <kbd className="font-sans font-semibold">Ctrl/⌘+Enter</kbd> 저장
            </p>
            <span
              className={`text-[11px] font-mono tabular-nums ${
                text.length >= MAX_INSTRUCTION_LENGTH ? 'text-badge-danger-fg' : 'text-fg-subtle'
              }`}
            >
              {text.length} / {MAX_INSTRUCTION_LENGTH}
            </span>
          </div>
        </div>

        {/* ── 예시 ── */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle uppercase tracking-wider">
            <i className="bx bx-bulb text-sm text-amber-400" />
            이런 지시가 많이 쓰여요
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => appendSuggestion(suggestion)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg-muted hover:border-indigo-200 dark:hover:border-indigo-700 hover:text-fg transition-colors"
              >
                <i className="bx bx-plus text-sm text-fg-subtle" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
