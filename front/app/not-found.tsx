import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      {/* 숫자 */}
      <p className="text-[96px] sm:text-[128px] font-black text-surface-3 leading-none select-none">
        404
      </p>

      {/* 아이콘 */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl -mt-6
          bg-primary-soft border border-border shadow-card"
      >
        <i className="bx bx-search-alt text-3xl text-primary" />
      </div>

      {/* 텍스트 */}
      <div className="mt-5 space-y-2">
        <h1 className="text-xl font-bold text-fg tracking-tight">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="text-sm text-fg-muted max-w-xs leading-relaxed">
          주소가 잘못됐거나 삭제된 페이지입니다.
          <br />
          URL을 다시 확인해 주세요.
        </p>
      </div>

      <div className="mt-7 w-12 h-px bg-border" />

      {/* 홈으로 */}
      <Link
        href="/dashboard"
        className="mt-7 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
          bg-primary text-primary-fg hover:brightness-110 active:scale-[0.98] transition-all shadow-card"
      >
        <i className="bx bx-home-alt" />
        홈으로 돌아가기
      </Link>
    </div>
  );
}
