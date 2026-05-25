interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-[3px]',
  lg: 'w-12 h-12 border-4',
};

export default function Spinner({ size = 'md' }: SpinnerProps) {
  return (
    <div
      className={`${sizeMap[size]} rounded-full border-blue-200 border-t-blue-600 animate-spin`}
      role="status"
      aria-label="로딩 중"
    />
  );
}
