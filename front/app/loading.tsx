export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
      {/* 스피너 */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
      </div>

      {/* 스켈레톤 콘텐츠 */}
      <div className="mt-4 w-full max-w-md space-y-3 px-4">
        <div className="h-3 w-24 rounded-full bg-slate-100 animate-pulse mx-auto" />
        <div className="h-5 w-48 rounded-full bg-slate-100 animate-pulse mx-auto" />
        <div className="h-3 w-64 rounded-full bg-slate-100 animate-pulse mx-auto" />
      </div>
    </div>
  );
}
