'use client';

import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '@/lib/cx';

/**
 * 폼 프리미티브.
 *
 * 이전에는 입력칸 42개가 17개 파일에 흩어져 각자 스타일링됐고, 공유 컴포넌트가
 * 없어서 두 파일이 각자 `INPUT_CLASS` 상수를 정의했다(이미 서로 달라지기 시작했다).
 *
 * 더 큰 문제는 접근성이었다 — `<label>` 27개 중 입력칸과 실제로 연결된(htmlFor)
 * 것이 2개뿐이었다. 스크린리더는 필드 이름을 읽지 못하고, 레이블을 눌러도 포커스가
 * 가지 않았다. 여기서는 useId 로 id를 만들어 label · 입력칸 · 에러 메시지를
 * 자동으로 묶는다. 호출부가 id를 신경 쓸 필요가 없으니 빠뜨릴 수도 없다.
 */

// ── 공통 입력칸 스타일 ────────────────────────────────────────────────────────
// 의미 토큰만 쓴다. 예전 INPUT_CLASS 는 `border-slate-200` + `dark:border-border`
// 처럼 라이트는 원색 · 다크는 토큰을 섞어 써서 색을 두 번 적어야 했다.
const CONTROL = cx(
  'w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg',
  'placeholder:text-fg-subtle',
  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
  'disabled:opacity-60 disabled:cursor-not-allowed',
  'aria-invalid:border-badge-danger-fg aria-invalid:ring-badge-danger-fg/30',
  'transition-shadow',
);

// ── 레이블 · 에러를 묶는 껍데기 ───────────────────────────────────────────────

interface FieldShellProps {
  label: string;
  /**
   * 레이블을 화면에서 감춘다(스크린리더에는 그대로 읽힌다).
   * 옆에 배지를 붙이려고 호출부가 제목을 직접 그리는 경우처럼, 눈에 보이는 레이블이
   * 이미 있는데 컨트롤과 연결만 필요한 자리에 쓴다.
   */
  srOnlyLabel?: boolean;
  /** 필수 표시(*)를 붙이고 aria-required 를 넘긴다 */
  required?: boolean;
  /** 입력 아래 보조 설명 */
  hint?: ReactNode;
  /** 채워지면 빨간 테두리 + role="alert" 로 안내된다 */
  error?: string | null;
  children: (props: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

function FieldShell({ label, srOnlyLabel, required, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={srOnlyLabel ? undefined : 'space-y-1.5'}>
      <label
        htmlFor={id}
        className={srOnlyLabel ? 'sr-only' : 'block text-xs font-semibold text-fg-muted'}
      >
        {label}
        {required && (
          <span className="text-badge-danger-fg ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}

      {hint && (
        <p id={hintId} className="text-xs text-fg-subtle leading-relaxed">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-badge-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  srOnlyLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
}

export function Input({
  label,
  srOnlyLabel,
  hint,
  error,
  className,
  required,
  ...props
}: InputProps) {
  return (
    <FieldShell label={label} srOnlyLabel={srOnlyLabel} required={required} hint={hint} error={error}>
      {(a11y) => (
        <input {...a11y} required={required} className={cx(CONTROL, className)} {...props} />
      )}
    </FieldShell>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  srOnlyLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function Select({
  label,
  srOnlyLabel,
  hint,
  error,
  className,
  required,
  children,
  ...props
}: SelectProps) {
  return (
    <FieldShell label={label} srOnlyLabel={srOnlyLabel} required={required} hint={hint} error={error}>
      {(a11y) => (
        <select {...a11y} required={required} className={cx(CONTROL, className)} {...props}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  srOnlyLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
}

export function Textarea({
  label,
  srOnlyLabel,
  hint,
  error,
  className,
  required,
  ...props
}: TextareaProps) {
  return (
    <FieldShell label={label} srOnlyLabel={srOnlyLabel} required={required} hint={hint} error={error}>
      {(a11y) => (
        <textarea {...a11y} required={required} className={cx(CONTROL, className)} {...props} />
      )}
    </FieldShell>
  );
}

/**
 * 레이블을 직접 그려야 하는 자리(인라인 폼 등)에서 입력칸 스타일만 빌려 쓸 때.
 * 되도록 위 컴포넌트를 쓰고, 이건 예외 경로로만 사용한다.
 */
export const controlClassName = CONTROL;
