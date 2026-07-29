import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/auth';
import LandingHeader from '@/components/landing/LandingHeader';

export const metadata: Metadata = {
  // 레이아웃의 '%s | 마케팅 AI' 템플릿이 붙으면 이름이 두 번 나오므로 absolute로 고정한다.
  title: { absolute: '마케팅 AI — 광고 데이터부터 리포트 발송까지' },
  description:
    '매체·전환 데이터를 올리면 리포트 집계, AI 분석 코멘트, 메일 발송까지 한 번에. 이미지 정제와 헤딩 문구 추천도 같은 화면에서 처리합니다.',
};

// ── 콘텐츠 데이터 ─────────────────────────────────────────────────────────────
// 사이드바 네비(NAV_GROUPS)와 일부러 분리해 둔다 — 내부 메뉴 이름은 언제든 바뀌지만
// 소개 페이지의 문구는 고객에게 보이는 메시지라 따로 관리하는 편이 안전하다.

const FEATURES = [
  {
    icon: 'bx-bar-chart-alt-2',
    accent: 'from-blue-500/15 to-indigo-500/5 border-blue-200/70 dark:border-blue-900/50',
    iconBg: 'bg-blue-600',
    title: 'SA 광고 대시보드',
    body: '매체별 CSV와 전환 데이터를 올리면 연·월 단위로 집계해 한 화면에서 보여줍니다. 저장된 기간은 언제든 다시 조회하고 Excel로 내려받을 수 있습니다.',
  },
  {
    icon: 'bx-mail-send',
    accent: 'from-emerald-500/15 to-teal-500/5 border-emerald-200/70 dark:border-emerald-900/50',
    iconBg: 'bg-emerald-600',
    title: '분석 코멘트 & 리포트 메일',
    body: 'AI가 성과 변화를 읽고 리포트 코멘트 초안을 씁니다. 확인·수정한 뒤 그대로 메일로 발송하고, 발송 결과까지 기록으로 남습니다.',
  },
  {
    icon: 'bx-transfer-alt',
    accent: 'from-violet-500/15 to-purple-500/5 border-violet-200/70 dark:border-violet-900/50',
    iconBg: 'bg-violet-600',
    title: '키워드 성과 비교',
    body: '이번 기간과 이전 기간의 키워드 전환 성과를 자동으로 맞대어 보여줍니다. 어떤 키워드가 올랐고 무엇이 빠졌는지 눈으로 찾지 않아도 됩니다.',
  },
  {
    icon: 'bx-filter-alt',
    accent: 'from-amber-500/15 to-orange-500/5 border-amber-200/70 dark:border-amber-900/50',
    iconBg: 'bg-amber-600',
    title: '이미지 정제',
    body: '소재 이미지를 올리고 원하는 수정을 문장으로 적으면 AI가 그대로 편집합니다. 간단한 보정 때문에 디자인 요청을 기다릴 필요가 없습니다.',
  },
  {
    icon: 'bx-crop',
    accent: 'from-sky-500/15 to-cyan-500/5 border-sky-200/70 dark:border-sky-900/50',
    iconBg: 'bg-sky-600',
    title: '이미지 리사이저',
    body: '매체가 요구하는 규격에 맞춰 JPEG · PNG · WebP를 한 번에 변환합니다. 소재 하나로 여러 매체 입고본을 만들 수 있습니다.',
  },
  {
    icon: 'bx-bulb',
    accent: 'from-rose-500/15 to-pink-500/5 border-rose-200/70 dark:border-rose-900/50',
    iconBg: 'bg-rose-600',
    title: '헤딩 문구 추천',
    body: 'AI가 소재 이미지를 분석해 매체별 헤딩 문구를 제안합니다. 생성한 문구는 기록에 쌓여 검색·복사해 다시 쓸 수 있습니다.',
  },
] as const;

const WORKFLOW = [
  {
    step: '01',
    icon: 'bx-cloud-upload',
    title: '올린다',
    body: '매체·전환 CSV나 기존 리포트 Excel을 끌어다 놓습니다. 여러 달이 섞인 파일도 기간별로 알아서 나눠 읽습니다.',
  },
  {
    step: '02',
    icon: 'bx-brain',
    title: '분석한다',
    body: '집계는 서버가, 성과 해석 코멘트는 AI가 씁니다. 결과는 DB에 기간 단위로 저장돼 다음 달에도 그대로 이어집니다.',
  },
  {
    step: '03',
    icon: 'bx-send',
    title: '전달한다',
    body: '완성된 리포트를 Excel로 받거나 메일로 바로 발송합니다. 누구에게 언제 나갔는지 발송 로그에 남습니다.',
  },
] as const;

const VALUES = [
  {
    icon: 'bx-time-five',
    title: '수작업이 사라집니다',
    body: '매체별 파일을 열어 붙여넣고 서식을 맞추던 과정을 업로드 한 번으로 대체합니다.',
  },
  {
    icon: 'bx-shield-quarter',
    title: '기록이 남습니다',
    body: '업로드한 기간, 발송한 메일, AI 사용 이력이 모두 저장돼 나중에 되짚어볼 수 있습니다.',
  },
  {
    icon: 'bx-slider-alt',
    title: '팀에 맞춰 켜고 끕니다',
    body: '기능별 사용 권한과 노출을 관리자가 직접 제어합니다. 필요한 도구만 열어두면 됩니다.',
  },
] as const;

// ── 페이지 ────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  // 로그인한 사용자가 소개 페이지에 들어오면 '로그인' 대신 바로 대시보드로 보낸다.
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const ctaHref = isLoggedIn ? '/dashboard' : '/login';
  const ctaLabel = isLoggedIn ? '대시보드 열기' : '로그인하고 시작하기';

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader isLoggedIn={isLoggedIn} />

      {/* 배경 그라디언트 */}
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_50%_-10%,rgba(37,99,235,0.16),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_10%,rgba(99,102,241,0.10),transparent)]" />
      </div>

      <main>
        {/* ── 히어로 ──────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
              border border-border bg-surface/70 text-xs font-semibold text-fg-muted tracking-wide"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            AI Marketing Analytics Platform
          </span>

          <h1 className="mt-6 text-3xl sm:text-5xl font-black text-fg tracking-tight leading-[1.2]">
            광고 데이터를 정리하는 시간을,
            <br className="hidden sm:block" />{' '}
            <span className="bg-linear-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
              성과를 올리는 시간
            </span>
            으로.
          </h1>

          <p className="mt-5 text-base sm:text-lg text-fg-muted leading-relaxed max-w-2xl mx-auto">
            매체·전환 데이터를 올리면 집계부터 AI 분석 코멘트, 리포트 메일 발송까지 이어집니다.
            소재 이미지 정제와 헤딩 문구 추천도 같은 자리에서 끝납니다.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]
                transition-all shadow-sm shadow-blue-600/30 w-full sm:w-auto justify-center"
            >
              <i className="bx bx-log-in-circle text-lg" />
              {ctaLabel}
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                border border-border bg-surface text-fg-body hover:bg-surface-2
                transition-colors w-full sm:w-auto justify-center"
            >
              기능 둘러보기
              <i className="bx bx-down-arrow-alt text-lg" />
            </a>
          </div>

          <p className="mt-5 text-xs text-fg-subtle">
            사내 계정으로 이용합니다 · 계정 발급은 관리자에게 문의해 주세요
          </p>
        </section>

        {/* ── 도입 효과 ───────────────────────────────────────────────────── */}
        <section id="why" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div className="grid sm:grid-cols-3 gap-4">
            {VALUES.map((value) => (
              <div
                key={value.title}
                className="rounded-2xl border border-border bg-surface/90 p-6 shadow-sm"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-soft text-primary">
                  <i className={`bx ${value.icon} text-xl`} />
                </span>
                <h3 className="mt-4 text-sm font-bold text-fg">{value.title}</h3>
                <p className="mt-2 text-sm text-fg-muted leading-relaxed">{value.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 기능 ────────────────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              Features
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">
              리포트 하나를 만들기까지 필요한 도구, 전부
            </h2>
            <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed">
              데이터 집계와 크리에이티브 작업을 오가느라 여러 도구를 띄울 필요가 없습니다.
              한 계정, 한 화면에서 처리합니다.
            </p>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className={`group rounded-2xl border bg-linear-to-br ${feature.accent}
                  bg-surface p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5
                  transition-all duration-200`}
              >
                <span
                  className={`flex items-center justify-center w-11 h-11 rounded-xl
                    ${feature.iconBg} text-white shadow-sm`}
                >
                  <i className={`bx ${feature.icon} text-xl`} />
                </span>
                <h3 className="mt-4 text-base font-bold text-fg tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm text-fg-muted leading-relaxed">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 워크플로우 ──────────────────────────────────────────────────── */}
        <section id="workflow" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div className="rounded-3xl border border-border bg-surface/90 p-6 sm:p-10 shadow-sm">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                How it works
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">
                세 단계면 리포트가 끝납니다
              </h2>
            </div>

            <ol className="mt-8 grid sm:grid-cols-3 gap-6 sm:gap-4">
              {WORKFLOW.map((stage) => (
                <li key={stage.step} className="relative sm:pr-6">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex items-center justify-center w-10 h-10 rounded-xl
                        bg-primary-soft text-primary shrink-0"
                    >
                      <i className={`bx ${stage.icon} text-xl`} />
                    </span>
                    <span className="text-xs font-black tracking-widest text-fg-subtle">
                      {stage.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-fg">{stage.title}</h3>
                  <p className="mt-2 text-sm text-fg-muted leading-relaxed">{stage.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 마무리 CTA ──────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div
            className="rounded-3xl border border-blue-500/20 p-8 sm:p-12 text-center
              bg-linear-to-br from-blue-600/12 via-indigo-500/8 to-transparent"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">
              이번 달 리포트부터 바로 써보세요
            </h2>
            <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed max-w-xl mx-auto">
              지난달 데이터를 그대로 올려 결과를 비교해보면 가장 빠릅니다.
              별도 설치 없이 브라우저에서 바로 시작합니다.
            </p>
            <Link
              href={ctaHref}
              className="mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]
                transition-all shadow-sm shadow-blue-600/30"
            >
              {ctaLabel}
              <i className="bx bx-right-arrow-alt text-lg" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── 푸터 ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div
          className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row
            items-center justify-between gap-3 text-xs text-fg-subtle"
        >
          <div className="flex items-center gap-2">
            <i className="bx bx-line-chart text-primary text-base" />
            <span className="font-semibold text-fg-muted">마케팅 AI</span>
            <span>· Analytics Platform</span>
          </div>
          <Link href={ctaHref} className="hover:text-fg-muted transition-colors">
            {isLoggedIn ? '대시보드로 이동' : '로그인'}
          </Link>
        </div>
      </footer>
    </div>
  );
}
