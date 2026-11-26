'use client';

import { memo } from 'react';
import type { ImageElement, Instruction } from '@/types/imageFilter';

interface InstructionCardProps {
  instruction: Instruction;
  /** 대상 요소 — null 이면 이미지 전체. 요소가 사라졌으면 missingTarget 이 true */
  element: ImageElement | null;
  /** 재분석으로 대상 요소가 없어진 상태 — 다시 고르라고 알려준다 */
  missingTarget: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

/**
 * 지시 한 건을 목록에서 보여 준다.
 *
 * 예전에는 써 둔 지시를 알려주는 단서가 입력창 위 11px 안내문 한 줄과 요소 칩에
 * 붙는 10px 연필 아이콘뿐이었다. 고치거나 지우려면 그 요소를 다시 골라 입력칸으로
 * 돌아가는 수밖에 없었다 — 수정·삭제 수단 자체가 없었다.
 *
 * 체크박스가 중요하다. 예전에는 써 둔 지시가 **전부** 함께 전송됐다. 써 두고 잊은
 * 지시가 다음 전송에 조용히 끼어들어 AI 호출 비용과 결과물이 예상과 달라졌다.
 */
function InstructionCard({
  instruction,
  element,
  missingTarget,
  onToggle,
  onEdit,
  onDelete,
  disabled = false,
}: InstructionCardProps) {
  const empty = !instruction.text.trim();
  const failed = instruction.status === 'failed';
  const inactive = !instruction.enabled || empty || missingTarget;

  return (
    <li
      className={[
        'rounded-xl border bg-surface transition-colors',
        failed
          ? 'border-badge-danger-bdr'
          : inactive
            ? 'border-border-soft'
            : 'border-border hover:border-indigo-200 dark:hover:border-indigo-800',
      ].join(' ')}
    >
      <div className="flex items-start gap-2 p-2.5">
        <input
          type="checkbox"
          checked={instruction.enabled}
          onChange={onToggle}
          disabled={disabled || empty || missingTarget}
          aria-label="이 지시를 전송에 포함"
          title={
            empty
              ? '내용이 비어 있어 전송되지 않습니다'
              : missingTarget
                ? '대상 요소를 다시 골라야 전송할 수 있습니다'
                : instruction.enabled
                  ? '전송에서 제외하기'
                  : '전송에 포함하기'
          }
          className="mt-0.5 w-4 h-4 shrink-0 rounded accent-indigo-600 disabled:opacity-40"
        />

        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="flex-1 min-w-0 text-left group disabled:pointer-events-none"
        >
          {/* 대상 */}
          <span
            className={[
              'inline-flex items-center gap-1 text-[11px] font-semibold',
              missingTarget
                ? 'text-badge-warn-fg'
                : element
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-fg-muted',
            ].join(' ')}
          >
            <i
              className={`bx ${
                missingTarget ? 'bx-error-circle' : element ? 'bx-target-lock' : 'bx-image'
              } text-sm`}
            />
            {missingTarget
              ? instruction.targetHint
                ? `대상을 다시 골라주세요 — 이전 대상: ${instruction.targetHint}`
                : '대상을 다시 골라주세요'
              : (element?.label ?? '이미지 전체')}
          </span>

          {/* 내용 */}
          <p
            className={[
              'mt-0.5 text-xs leading-relaxed line-clamp-3 break-words',
              empty ? 'text-fg-disabled italic' : inactive ? 'text-fg-subtle' : 'text-fg-body',
              'group-hover:text-fg',
            ].join(' ')}
          >
            {empty ? '내용이 비어 있어요 — 눌러서 작성하세요' : instruction.text}
          </p>

          {failed && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-badge-danger-fg">
              <i className="bx bx-error-circle text-sm" />
              직전 전송이 실패했어요 — 고쳐서 다시 보내 보세요
            </span>
          )}
        </button>

        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            title="지시 수정"
            aria-label="지시 수정"
            className="p-1.5 rounded-lg text-fg-subtle hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <i className="bx bx-edit-alt text-base block" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            title="지시 삭제"
            aria-label="지시 삭제"
            className="p-1.5 rounded-lg text-fg-subtle hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <i className="bx bx-trash text-base block" />
          </button>
        </div>
      </div>
    </li>
  );
}

export default memo(InstructionCard);
