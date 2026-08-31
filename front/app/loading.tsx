export default function Loading() {
  return (
    <div
      role="status"
      aria-label="페이지를 불러오는 중"
      className="flex flex-col items-center justify-center min-h-[70vh] gap-4"
    >
      {/* 스피너 */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-border" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
      </div>

      {/* 스켈레톤 콘텐츠 */}
      <div className="mt-4 w-full max-w-md space-y-3 px-4">
        <div className="h-3 w-24 rounded-full bg-surface-2 animate-pulse mx-auto" />
        <div className="h-5 w-48 rounded-full bg-surface-2 animate-pulse mx-auto" />
        <div className="h-3 w-64 rounded-full bg-surface-2 animate-pulse mx-auto" />
      </div>
    </div>
  );
}
