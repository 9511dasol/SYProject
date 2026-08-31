import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';
/**
 * 색 계열. 기능별 화면이 각자 액센트 색을 갖고 있어서(문구 추천=amber,
 * 이미지 정제=indigo, 리사이저=violet) 이걸 API로 열어 두지 않으면
 * 호출부가 `bg-amber-500!` 처럼 !important 로 덮어쓰게 된다.
 */
type Tone = 'brand' | 'danger' | 'success' | 'amber' | 'indigo' | 'violet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  tone?: Tone;
  isLoading?: boolean;
}

const SIZES: Record<Size, string> = {
  sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-xs',
  md: 'gap-2 rounded-xl px-4 py-2 text-sm',
  lg: 'gap-2 rounded-xl px-5 py-3 text-sm',
};

/** [배경, hover, 링] — solid 계열에서 쓴다 */
const TONES: Record<Tone, { solid: string; soft: string; text: string }> = {
  brand: {
    solid: 'bg-primary text-primary-fg hover:brightness-110 shadow-card',
    soft: 'hover:bg-primary-soft',
    text: 'text-primary',
  },
  danger: {
    solid: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
    soft: 'hover:bg-badge-danger-bg',
    text: 'text-badge-danger-fg',
  },
  success: {
    solid: 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600',
    soft: 'hover:bg-badge-success-bg',
    text: 'text-badge-success-fg',
  },
  amber: {
    solid: 'bg-amber-500 text-white hover:bg-amber-600',
    soft: 'hover:bg-badge-amber-bg',
    text: 'text-badge-amber-fg',
  },
  indigo: {
    solid: 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
    soft: 'hover:bg-indigo-50 dark:hover:bg-indigo-950/40',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  violet: {
    solid: 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600',
    soft: 'hover:bg-violet-50 dark:hover:bg-violet-950/40',
    text: 'text-violet-600 dark:text-violet-400',
  },
};

export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  tone = 'brand',
  isLoading = false,
  disabled,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const t = TONES[tone];

  const variants: Record<Variant, string> = {
    primary: cx(t.solid, 'active:scale-[0.98]'),
    ghost: cx(t.text, t.soft),
    outline: cx('border border-border text-fg hover:bg-surface-2 active:scale-[0.98]'),
  };

  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center font-semibold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-50',
        SIZES[size],
        variants[variant],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span
          aria-hidden
          className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin shrink-0"
        />
      )}
      {children}
    </button>
  );
}
