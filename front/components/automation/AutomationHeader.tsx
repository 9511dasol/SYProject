/**
 * `/automation` 전용 상단 바.
 *
 * `components/landing/LandingHeader` 를 재사용하지 않는다. 그쪽은 사내 사용자를
 * 로그인으로 보내는 제품 소개 헤더이고, 이쪽은 광고를 누르고 들어온 외부 방문자를
 * 상담 폼으로 보내는 판매 페이지 헤더다. 목적지가 다르면 헤더도 다르다.
 *
 * ThemeToggle 도 없다 — 아래 page.tsx 주석 참고.
 */
export default function AutomationHeader() {
  return (
    <header
      className="sticky top-0 z-[var(--z-sticky)] h-16 border-b border-[#eae5d9]
        bg-[#faf7f1]/85 backdrop-blur-md"
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="text-xl font-black tracking-tight text-[#0b1f3a]">
          adledger
        </a>

        <a
          href="#contact"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-5 py-2.5
            text-sm font-bold text-white transition-colors hover:bg-[#1d4ed8]
            active:scale-[0.98]"
        >
          상담 신청
        </a>
      </div>
    </header>
  );
}
