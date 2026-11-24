import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/auth';
import LandingHeader from '@/components/landing/LandingHeader';
import ShowcaseSection from '@/components/landing/ShowcaseSection';
import Reveal from '@/components/landing/showcase/Reveal';
import DashboardMock from '@/components/landing/showcase/DashboardMock';
import RankMonitorMock from '@/components/landing/showcase/RankMonitorMock';
import ImageFilterMock from '@/components/landing/showcase/ImageFilterMock';
import ReportMailMock from '@/components/landing/showcase/ReportMailMock';
import EffectStats from '@/components/landing/showcase/EffectStats';

export const metadata: Metadata = {
  // 레이아웃의 '%s | 마케팅 AI' 템플릿이 붙으면 이름이 두 번 나오므로 absolute로 고정한다.
  title: { absolute: '마케팅 AI — 광고 데이터부터 리포트 발송까지' },
  description:
    '매체·전환 데이터를 올리면 리포트 집계, AI 분석 코멘트, 메일 발송까지 한 번에. 이미지 정제와 헤딩 문구 추천도 같은 화면에서 처리합니다.',
};

// ── 콘텐츠 데이터 ─────────────────────────────────────────────────────────────
// 사이드바 네비(NAV_GROUPS)와 일부러 분리해 둔다 — 내부 메뉴 이름은 언제든 바뀌지만
// 소개 페이지의 문구는 고객에게 보이는 메시지라 따로 관리하는 편이 안전하다.
// 목업 안의 수치는 전부 예시값이며, 각 목업이 '예시 데이터' 배지를 직접 단다.

const SHOWCASES = [
  {
    id: 'rank-monitor',
    flip: true,
    eyebrow: 'Rank Monitoring',
    icon: 'bx-trending-up',
    isNew: true,
    title: '순위가 떨어진 걸, 고객보다 먼저 알 수 있습니다',
    body: '키워드 노출 순위를 매일 기록하고, 목표 순위를 벗어나면 바로 표시합니다. 아침마다 검색창에 키워드를 쳐보던 일을 대시보드가 대신합니다.',
    bullets: [
      '키워드별 목표 순위 설정과 이탈 감지',
      '상승 · 하락 추이를 한 줄 스파크라인으로 확인',
      '기록이 쌓여 기간별 변화를 되짚을 수 있습니다',
    ],
    mock: <RankMonitorMock />,
  },
  {
    id: 'image-filter',
    flip: false,
    eyebrow: 'Image Editing',
    icon: 'bx-filter-alt',
    isNew: true,
    title: '디자인 요청 대기열 없이, 문장 한 줄로',
    body: '소재 이미지를 올리고 원하는 수정을 말로 적으면 AI가 그대로 편집합니다. 배경 교체나 색 보정 같은 간단한 작업 때문에 기다릴 필요가 없습니다.',
    bullets: [
      '프롬프트 한 줄로 배경 · 색 · 소품 수정',
      '원본은 그대로 두고 결과만 새 파일로',
      '리사이저와 이어서 매체 규격 입고본까지 한 번에',
    ],
    mock: <ImageFilterMock />,
  },
  {
    id: 'report-mail',
    flip: true,
    eyebrow: 'Report & Mail',
    icon: 'bx-mail-send',
    isNew: false,
    title: '집계부터 발송까지, 리포트가 한 화면에서 끝납니다',
    body: 'AI가 성과 변화를 읽고 코멘트 초안을 씁니다. 검토해서 다듬은 뒤 그대로 메일로 발송하면, 누구에게 언제 나갔는지까지 기록으로 남습니다.',
    bullets: [
      '전월 대비 변화를 읽어주는 AI 코멘트 초안',
      'Excel 첨부와 메일 발송을 한 번에',
      '발송 결과는 로그로 남아 실패 건 재발송도 간단합니다',
    ],
    mock: <ReportMailMock />,
  },
] as const;

const MORE_FEATURES = [
  {
    icon: 'bx-transfer-alt',
    accent: 'from-violet-500/15 to-purple-500/5 border-violet-200/70 dark:border-violet-900/50',
    iconBg: 'bg-violet-600',
    title: '키워드 성과 비교',
    body: '이번 기간과 이전 기간의 키워드 전환 성과를 자동으로 맞대어 보여줍니다. 어떤 키워드가 올랐고 무엇이 빠졌는지 눈으로 찾지 않아도 됩니다.',
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
    title: '헤딩 문구 추천 & 기록',
    body: 'AI가 소재 이미지를 분석해 매체별 헤딩 문구를 제안합니다. 생성한 문구는 기록에 쌓여 검색 · 복사해 다시 쓸 수 있습니다.',
  },
] as const;

// 비교 축은 '일하는 방식'이다 — 특정 경쟁사 이름을 박으면 근거를 대야 하는
// 비교 광고가 되므로, 수작업·범용 도구 조합이라는 일반 범주와만 비교한다.
type CompareLevel = 'yes' | 'partial' | 'no';

const COMPARE_COLUMNS = ['수작업 (엑셀 · 메일)', '범용 도구 조합', '마케팅 AI'] as const;
// 모바일 카드의 좁은 라벨 칸(w-20)에서 줄바꿈 없이 들어가는 짧은 이름
const COMPARE_COLUMNS_SHORT = ['수작업', '도구 조합', '마케팅 AI'] as const;

const COMPARE_ROWS: readonly {
  label: string;
  cells: readonly { level: CompareLevel; text: string }[];
}[] = [
  {
    label: '매체 리포트 집계',
    cells: [
      { level: 'no', text: '파일마다 직접 취합' },
      { level: 'partial', text: '연동 설정 · 학습 필요' },
      { level: 'yes', text: '업로드 한 번이면 끝' },
    ],
  },
  {
    label: '성과 분석 코멘트',
    cells: [
      { level: 'no', text: '매번 직접 작성' },
      { level: 'no', text: '지원 안 함' },
      { level: 'yes', text: 'AI가 초안 작성' },
    ],
  },
  {
    label: '리포트 메일 발송',
    cells: [
      { level: 'partial', text: '메일로 수동 발송' },
      { level: 'no', text: '별도 도구 필요' },
      { level: 'yes', text: '같은 화면에서 발송 · 기록' },
    ],
  },
  {
    label: '키워드 순위 추적',
    cells: [
      { level: 'no', text: '매일 직접 검색' },
      { level: 'partial', text: '전용 툴 별도 구독' },
      { level: 'yes', text: '자동 기록 + 이탈 경고' },
    ],
  },
  {
    label: '소재 이미지 편집',
    cells: [
      { level: 'no', text: '디자인 요청 후 대기' },
      { level: 'partial', text: '편집 도구 별도 구독' },
      { level: 'yes', text: '프롬프트 한 줄로 처리' },
    ],
  },
  {
    label: '발송 · 사용 기록',
    cells: [
      { level: 'no', text: '메일함에 흩어짐' },
      { level: 'partial', text: '도구마다 분산' },
      { level: 'yes', text: '한곳에 자동 저장' },
    ],
  },
];

// 셀 아이콘 — ✗ 를 빨강으로 칠하면 표 전체가 공격적으로 읽혀서 중립 회색을 쓴다
const COMPARE_LEVEL_STYLE: Record<CompareLevel, { icon: string; className: string }> = {
  yes: { icon: 'bx-check-circle', className: 'text-emerald-600 dark:text-emerald-400' },
  partial: { icon: 'bx-minus-circle', className: 'text-amber-500' },
  no: { icon: 'bx-x-circle', className: 'text-fg-disabled' },
};

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
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-14 sm:pt-24 sm:pb-16 text-center">
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

          {/* 히어로 샷 — SA 광고 대시보드 목업이 첫 쇼케이스를 겸한다 */}
          <div className="mt-12 sm:mt-16 max-w-4xl mx-auto text-left">
            <Reveal>
              <DashboardMock />
            </Reveal>
            <p className="mt-4 text-center text-xs text-fg-subtle">
              SA 광고 대시보드 — 업로드한 매체 · 전환 데이터가 이렇게 정리됩니다
            </p>
          </div>
        </section>

        {/* ── 기능 쇼케이스 ───────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20 sm:pb-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              Features
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">
              화면으로 먼저 보는 주요 기능
            </h2>
            <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed">
              데이터 집계와 크리에이티브 작업을 오가느라 여러 도구를 띄울 필요가 없습니다.
              한 계정, 한 화면에서 처리합니다. 아래 화면은 모두 예시 데이터입니다.
            </p>
          </div>

          <div className="mt-12 sm:mt-16 space-y-20 sm:space-y-24">
            {SHOWCASES.map((showcase) => (
              <ShowcaseSection
                key={showcase.id}
                flip={showcase.flip}
                eyebrow={showcase.eyebrow}
                icon={showcase.icon}
                isNew={showcase.isNew}
                title={showcase.title}
                body={showcase.body}
                bullets={showcase.bullets}
              >
                {showcase.mock}
              </ShowcaseSection>
            ))}
          </div>

          {/* 나머지 기능 — 컴팩트 카드 */}
          <div className="mt-20 sm:mt-24">
            <h3 className="text-lg sm:text-xl font-bold text-fg tracking-tight">
              함께 쓰는 도구들
            </h3>
            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MORE_FEATURES.map((feature) => (
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
                  <h4 className="mt-4 text-base font-bold text-fg tracking-tight">{feature.title}</h4>
                  <p className="mt-2 text-sm text-fg-muted leading-relaxed">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 타사 방식 비교 ──────────────────────────────────────────────── */}
        <section id="compare" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              Compare
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">
              지금 방식과 나란히 놓고 보면
            </h2>
            <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed">
              엑셀과 메일로 버티는 수작업, 도구를 여러 개 이어 붙이는 조합과 비교했습니다.
              같은 일을 어디까지 줄여주는지가 기준입니다.
            </p>
          </div>

          {/* 모바일 — 가로 스크롤 테이블은 핵심 열(마케팅 AI)이 화면 밖에 숨으므로
              업무별 카드로 풀어서 세 방식을 세로로 나란히 보여준다 */}
          <div className="mt-8 space-y-4 sm:hidden">
            {COMPARE_ROWS.map((row) => (
              <div
                key={row.label}
                className="rounded-2xl border border-border bg-surface/90 shadow-sm overflow-hidden"
              >
                <p className="px-4 py-3 text-sm font-bold text-fg border-b border-border-soft">
                  {row.label}
                </p>
                <ul>
                  {row.cells.map((cell, i) => {
                    const isOurs = i === row.cells.length - 1;
                    return (
                      <li
                        key={COMPARE_COLUMNS[i]}
                        className={`flex items-center gap-2.5 px-4 py-2.5
                          ${isOurs ? 'bg-primary-soft/60' : ''}`}
                      >
                        <span
                          className={`w-20 shrink-0 text-[11px] font-semibold
                            ${isOurs ? 'text-primary' : 'text-tbl-head-fg'}`}
                        >
                          {COMPARE_COLUMNS_SHORT[i]}
                        </span>
                        <i
                          className={`bx ${COMPARE_LEVEL_STYLE[cell.level].icon} text-lg shrink-0
                            ${COMPARE_LEVEL_STYLE[cell.level].className}`}
                        />
                        <span
                          className={`text-[13px] leading-snug
                            ${isOurs ? 'text-fg-body font-medium' : 'text-fg-muted'}`}
                        >
                          {cell.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* 데스크톱 — 비교 테이블 */}
          <div className="mt-8 hidden sm:block overflow-x-auto rounded-2xl border border-border bg-surface/90 shadow-sm">
            <table className="w-full min-w-[640px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-4 text-xs font-semibold text-tbl-head-fg w-[22%]">
                    업무
                  </th>
                  {COMPARE_COLUMNS.map((column, i) => (
                    <th
                      key={column}
                      className={`text-left px-5 py-4 text-xs font-bold w-[26%]
                        ${
                          i === COMPARE_COLUMNS.length - 1
                            ? 'text-primary bg-primary-soft/60'
                            : 'text-fg-muted'
                        }`}
                    >
                      {i === COMPARE_COLUMNS.length - 1 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <i className="bx bx-line-chart text-sm" />
                          {column}
                        </span>
                      ) : (
                        column
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border-soft last:border-b-0">
                    <td className="px-5 py-3.5 font-semibold text-fg">{row.label}</td>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={`px-5 py-3.5 text-fg-muted
                          ${i === row.cells.length - 1 ? 'bg-primary-soft/60 text-fg-body font-medium' : ''}`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <i
                            className={`bx ${COMPARE_LEVEL_STYLE[cell.level].icon} text-lg shrink-0
                              ${COMPARE_LEVEL_STYLE[cell.level].className}`}
                          />
                          {cell.text}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* ── 도입 효과 ───────────────────────────────────────────────────── */}
        <section id="why" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              Impact
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">
              도입하면 이렇게 달라집니다
            </h2>
          </div>

          <div className="mt-8">
            <EffectStats />
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-4">
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
