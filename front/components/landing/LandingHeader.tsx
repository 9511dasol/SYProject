import Link from 'next/link';
import ThemeToggle from '@/components/ui/ThemeToggle';

interface LandingHeaderProps {
  /** 로그인 상태에 따라 우측 CTA를 '대시보드 열기' / '로그인'으로 바꾼다. */
  isLoggedIn: boolean;
}

const ANCHORS = [
  { href: '#features', label: '기능' },
  { href: '#workflow', label: '워크플로우' },
  { href: '#why', label: '도입 효과' },
] as const;

export default function LandingHeader({ isLoggedIn }: LandingHeaderProps) {
  return (
    <header
      className="sticky top-0 z-[var(--z-sticky)] h-16 border-b border-border/70
        bg-bg/80 backdrop-blur-md"
    >
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 min-w-0 shrink-0">
          <span
            className="flex items-center justify-center w-9 h-9 rounded-xl
              bg-linear-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-600/30"
          >
            <i className="bx bx-line-chart text-white text-lg" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-fg leading-tight">마케팅 AI</span>
            <span className="block text-[10px] text-fg-subtle leading-tight tracking-wide">
              Analytics Platform
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-6">
          {ANCHORS.map((anchor) => (
            <a
              key={anchor.href}
              href={anchor.href}
              className="px-3 py-2 rounded-lg text-sm font-medium text-fg-muted
                hover:text-fg hover:bg-surface-2 transition-colors"
            >
              {anchor.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
              bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]
              transition-all shadow-sm shadow-blue-600/25"
          >
            {isLoggedIn ? '대시보드 열기' : '로그인'}
            <i className="bx bx-right-arrow-alt text-base" />
          </Link>
        </div>
      </div>
    </header>
  );
}
